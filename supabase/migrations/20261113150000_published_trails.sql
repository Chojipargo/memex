-- memex.ai: published trails
--
-- Lets a reader share one of their generated trails on the public Explore
-- page, so other people can follow the same path and ask the question against
-- their own library.
--
-- Publishing takes a snapshot. Only what a trail step already shows is copied:
-- the "why this follows" note, the AI gist, the verified key quote, the source
-- title and page, and (for web research) the URL. Full passages of private
-- uploads are never copied, and no RLS policy on documents or chunks is
-- loosened. Continuing a trail does not change its public copy until the
-- owner publishes again.
--
-- Popularity is the number of distinct signed-in readers (other than the
-- author) who have opened the trail. Who read what is never exposed; only the
-- count is.
--
-- All writes go through the security definer functions below, which check
-- auth.uid() themselves. The tables have no insert/update/delete grants, so a
-- client cannot forge a snapshot or inflate learner_count through PostgREST.
--
-- Safe to run after 20261113120000_match_documents_recall.sql.

-- ---------------------------------------------------------- published_trails

create table if not exists public.published_trails (
  id uuid primary key default gen_random_uuid(),
  trail_id uuid not null unique references public.trails (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  question text not null check (char_length(question) between 1 and 1000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  step_count integer not null check (step_count between 1 and 40),
  origin text not null check (origin in ('library', 'web', 'hybrid')),
  learner_count integer not null default 0 check (learner_count >= 0),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.published_trails is
  'Public snapshots of generated trails, listed on the Explore page.';
comment on column public.published_trails.steps is
  'Ordered step snapshot: position, note, gist, quote, source title/page/origin/url/domain. Never full private passages.';
comment on column public.published_trails.learner_count is
  'Distinct signed-in readers other than the author. Maintained by record_trail_learner.';

create index if not exists published_trails_popular_idx
  on public.published_trails (learner_count desc, published_at desc);

create index if not exists published_trails_recent_idx
  on public.published_trails (published_at desc);

create index if not exists published_trails_user_idx
  on public.published_trails (user_id);

-- ------------------------------------------------- published_trail_learners

create table if not exists public.published_trail_learners (
  published_trail_id uuid not null references public.published_trails (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  primary key (published_trail_id, user_id)
);

comment on table public.published_trail_learners is
  'One row per reader per published trail. Private: only learner_count is exposed.';

-- ---------------------------------------------------------------------- RLS

alter table public.published_trails enable row level security;
alter table public.published_trail_learners enable row level security;

drop policy if exists "Anyone can read published trails" on public.published_trails;
create policy "Anyone can read published trails"
  on public.published_trails for select
  to anon, authenticated
  using (true);

-- No policies on published_trail_learners: it is only touched by
-- record_trail_learner, which runs as the table owner.

revoke all on public.published_trails from anon, authenticated;
revoke all on public.published_trail_learners from anon, authenticated;
grant select on public.published_trails to anon, authenticated;

-- -------------------------------------------------------------- publish_trail

-- Publish (or refresh the public copy of) one of the caller's trails and
-- return the published id.
create or replace function public.publish_trail(p_trail_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_trail public.trails%rowtype;
  v_steps jsonb;
  v_step_count integer;
  v_has_library boolean;
  v_has_web boolean;
  v_origin text;
  v_published_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select t.*
  into v_trail
  from public.trails t
  where t.id = p_trail_id
    and t.user_id = v_user_id;

  if not found then
    raise exception 'Trail not found';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', s.position,
          'note', s.note,
          'gist', s.gist,
          'quote',
            case
              when s.quote_start is not null
                and s.quote_end is not null
                and s.quote_end <= char_length(c.text)
              then nullif(
                btrim(substr(c.text, s.quote_start + 1, s.quote_end - s.quote_start)),
                ''
              )
            end,
          'sourceTitle', d.title,
          'page', c.page,
          'sourceOrigin', case when d.source_kind = 'web' then 'web' else 'library' end,
          'sourceUrl', case when d.source_kind = 'web' then d.source_url end,
          'sourceDomain', case when d.source_kind = 'web' then d.source_domain end
        )
        order by s.position
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    coalesce(bool_or(d.source_kind is distinct from 'web'), false),
    coalesce(bool_or(d.source_kind = 'web'), false)
  into v_steps, v_step_count, v_has_library, v_has_web
  from public.trail_steps s
  join public.chunks c on c.id = s.chunk_id
  join public.documents d on d.document_id = c.document_id
  where s.trail_id = p_trail_id
    and s.user_id = v_user_id;

  if v_step_count < 1 then
    raise exception 'This trail has no steps to publish';
  end if;

  if v_step_count > 40 then
    raise exception 'Trails with more than 40 steps cannot be published';
  end if;

  v_origin := case
    when v_has_library and v_has_web then 'hybrid'
    when v_has_web then 'web'
    else 'library'
  end;

  insert into public.published_trails (
    trail_id, user_id, title, question, steps, step_count, origin
  )
  values (
    v_trail.id, v_user_id, v_trail.title, v_trail.question, v_steps, v_step_count, v_origin
  )
  on conflict (trail_id) do update
    set title = excluded.title,
        question = excluded.question,
        steps = excluded.steps,
        step_count = excluded.step_count,
        origin = excluded.origin,
        updated_at = now()
  returning id into v_published_id;

  return v_published_id;
end;
$$;

-- ------------------------------------------------------------ unpublish_trail

create or replace function public.unpublish_trail(p_trail_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  delete from public.published_trails p
  where p.trail_id = p_trail_id
    and p.user_id = v_user_id;

  return found;
end;
$$;

-- ----------------------------------------------------- get_trail_publication

-- The caller's publication of a trail, if any.
create or replace function public.get_trail_publication(p_trail_id uuid)
returns table (
  published_id uuid,
  step_count integer,
  learner_count integer,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.step_count, p.learner_count, p.published_at, p.updated_at
  from public.published_trails p
  where p.trail_id = p_trail_id
    and p.user_id = auth.uid();
$$;

-- ------------------------------------------------------- record_trail_learner

-- Count the caller as a learner of a published trail, once. Authors are not
-- counted on their own trails. Returns the current learner_count.
create or replace function public.record_trail_learner(p_published_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_author uuid;
  v_count integer;
begin
  select p.user_id, p.learner_count
  into v_author, v_count
  from public.published_trails p
  where p.id = p_published_id;

  if not found then
    raise exception 'Published trail not found';
  end if;

  if v_user_id is null or v_user_id = v_author then
    return v_count;
  end if;

  insert into public.published_trail_learners (published_trail_id, user_id)
  values (p_published_id, v_user_id)
  on conflict do nothing;

  if found then
    update public.published_trails p
    set learner_count = p.learner_count + 1
    where p.id = p_published_id
    returning p.learner_count into v_count;
  end if;

  return v_count;
end;
$$;

revoke all on function public.publish_trail(uuid) from public, anon;
revoke all on function public.unpublish_trail(uuid) from public, anon;
revoke all on function public.get_trail_publication(uuid) from public, anon;
revoke all on function public.record_trail_learner(uuid) from public, anon;

grant execute on function public.publish_trail(uuid) to authenticated;
grant execute on function public.unpublish_trail(uuid) to authenticated;
grant execute on function public.get_trail_publication(uuid) to authenticated;
grant execute on function public.record_trail_learner(uuid) to authenticated;
