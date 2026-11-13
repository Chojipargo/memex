-- memex.ai: associative links
--
-- Makes the link between two passages a first-class record. A trail is now a
-- chain of passages joined by links: every step after the first points at the
-- link from the previous step's passage to its own (trail_steps.link_id).
-- Links are shared across trails, so a connection made once is discoverable
-- from either passage and from every trail that walks it.
--
-- Existing trails are converted in place: each pair of consecutive steps
-- becomes a 'claude_accepted' link whose reason is the later step's note. A
-- first step has no incoming link, so its note stays its opening line.
-- Annotations start empty: they are the reader's own notes. trail_steps.note
-- is kept (and still written) during the transition so older clients and
-- Explore snapshots keep working.
--
-- Safe to run after 20261113150000_published_trails.sql.

-- -------------------------------------------------------------------- links

create table if not exists public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_chunk_id bigint not null references public.chunks (id) on delete cascade,
  target_chunk_id bigint not null references public.chunks (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  origin text not null check (origin in ('user', 'claude_accepted')),
  traversal_count integer not null default 0 check (traversal_count >= 0),
  last_traversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint links_distinct_chunks check (source_chunk_id <> target_chunk_id),
  constraint links_pair_unique unique (user_id, source_chunk_id, target_chunk_id)
);

comment on table public.links is
  'Associative link between two of a user''s passages. Stored in reading order (source -> target) but queried in both directions.';
comment on column public.links.origin is
  'user: made by hand. claude_accepted: written by Claude and kept by the user (generated trails count as accepted).';
comment on column public.links.traversal_count is
  'How many times the link has been followed in the reader or while stepping through a trail.';

create index if not exists links_source_idx on public.links (source_chunk_id);
create index if not exists links_target_idx on public.links (target_chunk_id);
create index if not exists links_user_updated_idx on public.links (user_id, updated_at desc);

alter table public.links enable row level security;

-- A user may only see and change their own links, and may only join passages
-- from their own library.
drop policy if exists "Users can read their links" on public.links;
create policy "Users can read their links"
  on public.links for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create links between their passages" on public.links;
create policy "Users can create links between their passages"
  on public.links for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.chunks c
      join public.documents d on d.document_id = c.document_id
      where c.id = source_chunk_id and d.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.chunks c
      join public.documents d on d.document_id = c.document_id
      where c.id = target_chunk_id and d.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can update their links" on public.links;
create policy "Users can update their links"
  on public.links for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their links" on public.links;
create policy "Users can delete their links"
  on public.links for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.links to authenticated;

-- ------------------------------------------------------- trail_steps columns

alter table public.trail_steps
  add column if not exists link_id uuid references public.links (id) on delete restrict,
  add column if not exists annotation text;

alter table public.trail_steps
  drop constraint if exists trail_steps_annotation_length;
alter table public.trail_steps
  add constraint trail_steps_annotation_length
  check (annotation is null or char_length(annotation) between 1 and 4000);

comment on column public.trail_steps.link_id is
  'Link from the previous step''s passage to this one. Null only on the first step.';
comment on column public.trail_steps.annotation is
  'Reader''s note on this step of this trail, separate from the link''s reason.';
comment on column public.trail_steps.note is
  'Deprecated: the reason now lives on links.reason. Still written for older clients.';

create index if not exists trail_steps_link_idx on public.trail_steps (link_id);

-- ---------------------------------------------------------- link_trail_steps

-- Give every step after the first a link from the previous step's passage.
-- An existing link for the same pair is reused (and its reason kept); a new
-- one takes the step's note as its reason. Steps that already have a link
-- are left alone. Runs as the caller, so RLS applies.
create or replace function public.link_trail_steps(p_trail_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  insert into public.links (user_id, source_chunk_id, target_chunk_id, reason, origin)
  select cur.user_id, prev.chunk_id, cur.chunk_id, btrim(cur.note), 'claude_accepted'
  from public.trail_steps cur
  join public.trail_steps prev
    on prev.trail_id = cur.trail_id
   and prev.position = cur.position - 1
  where cur.trail_id = p_trail_id
    and cur.link_id is null
    and prev.chunk_id <> cur.chunk_id
  on conflict (user_id, source_chunk_id, target_chunk_id) do nothing;

  update public.trail_steps cur
  set link_id = l.id
  from public.trail_steps prev, public.links l
  where cur.trail_id = p_trail_id
    and cur.link_id is null
    and prev.trail_id = cur.trail_id
    and prev.position = cur.position - 1
    and l.user_id = cur.user_id
    and l.source_chunk_id = prev.chunk_id
    and l.target_chunk_id = cur.chunk_id;
end;
$$;

grant execute on function public.link_trail_steps(uuid) to authenticated;

-- ------------------------------------------------------- convert old trails

do $$
declare
  v_trail_id uuid;
begin
  for v_trail_id in select id from public.trails loop
    perform public.link_trail_steps(v_trail_id);
  end loop;
end;
$$;

-- ----------------------------------------------- create_generated_trail (v3)

create or replace function public.create_generated_trail(
  p_question text,
  p_title text,
  p_model text,
  p_steps jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trail_id uuid;
  v_step_count integer;
  v_question text := btrim(coalesce(p_question, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_model text := btrim(coalesce(p_model, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(v_question) not between 1 and 1000 then
    raise exception 'Question must be between 1 and 1000 characters';
  end if;

  if char_length(v_title) not between 1 and 200 then
    raise exception 'Title must be between 1 and 200 characters';
  end if;

  if char_length(v_model) not between 1 and 200 then
    raise exception 'Model is required';
  end if;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Steps must be a JSON array';
  end if;

  v_step_count := jsonb_array_length(p_steps);

  if v_step_count < 1 or v_step_count > 12 then
    raise exception 'A trail must contain between 1 and 12 steps';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    where jsonb_typeof(step.value) is distinct from 'object'
      or (step.value ->> 'chunk_id') is null
      or (step.value ->> 'chunk_id') !~ '^[0-9]+$'
      or jsonb_typeof(step.value -> 'note') is distinct from 'string'
      or char_length(btrim(step.value ->> 'note')) not between 1 and 1000
  ) then
    raise exception 'Each step needs a chunk_id and a note of 1-1000 characters';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    left join public.chunks c
      on c.id = (step.value ->> 'chunk_id')::bigint
    left join public.documents d
      on d.document_id = c.document_id
    where c.id is null
      or d.user_id is distinct from v_user_id
  ) then
    raise exception 'One or more chunks were not found in your library';
  end if;

  insert into public.trails (user_id, question, title, model)
  values (v_user_id, v_question, v_title, v_model)
  returning id into v_trail_id;

  insert into public.trail_steps (
    trail_id,
    user_id,
    position,
    chunk_id,
    note,
    gist,
    quote_start,
    quote_end
  )
  select
    v_trail_id,
    v_user_id,
    step.ordinality::integer,
    c.id,
    btrim(step.value ->> 'note'),
    parsed.gist,
    case when parsed.quote_ok then parsed.quote_start end,
    case when parsed.quote_ok then parsed.quote_end end
  from jsonb_array_elements(p_steps) with ordinality as step(value, ordinality)
  join public.chunks c
    on c.id = (step.value ->> 'chunk_id')::bigint
  cross join lateral public.parse_trail_step_digest(step.value, c.text) as parsed;

  perform public.link_trail_steps(v_trail_id);

  return v_trail_id;
end;
$$;

-- ------------------------------------------ append_generated_trail_steps (v3)

create or replace function public.append_generated_trail_steps(
  p_trail_id uuid,
  p_steps jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_new_count integer;
  v_max_position integer;
  v_step_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_trail_id is null then
    raise exception 'A trail id is required';
  end if;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Steps must be a JSON array';
  end if;

  v_new_count := jsonb_array_length(p_steps);

  if v_new_count < 1 or v_new_count > 8 then
    raise exception 'A continuation must add between 1 and 8 steps';
  end if;

  if not exists (
    select 1
    from public.trails t
    where t.id = p_trail_id
      and t.user_id = v_user_id
  ) then
    raise exception 'Trail not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trail_id::text, 0));

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    where jsonb_typeof(step.value) is distinct from 'object'
      or (step.value ->> 'chunk_id') is null
      or (step.value ->> 'chunk_id') !~ '^[0-9]+$'
      or jsonb_typeof(step.value -> 'note') is distinct from 'string'
      or char_length(btrim(step.value ->> 'note')) not between 1 and 1000
  ) then
    raise exception 'Each step needs a chunk_id and a note of 1-1000 characters';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    left join public.chunks c
      on c.id = (step.value ->> 'chunk_id')::bigint
    left join public.documents d
      on d.document_id = c.document_id
    where c.id is null
      or d.user_id is distinct from v_user_id
  ) then
    raise exception 'One or more chunks were not found in your library';
  end if;

  if (
    select count(distinct (step.value ->> 'chunk_id')::bigint)
    from jsonb_array_elements(p_steps) as step(value)
  ) <> v_new_count then
    raise exception 'A passage can only appear once in a trail';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    join public.trail_steps s
      on s.trail_id = p_trail_id
     and s.chunk_id = (step.value ->> 'chunk_id')::bigint
  ) then
    raise exception 'A passage can only appear once in a trail';
  end if;

  select coalesce(max(s.position), 0)
  into v_max_position
  from public.trail_steps s
  where s.trail_id = p_trail_id;

  insert into public.trail_steps (
    trail_id,
    user_id,
    position,
    chunk_id,
    note,
    gist,
    quote_start,
    quote_end
  )
  select
    p_trail_id,
    v_user_id,
    v_max_position + step.ordinality::integer,
    c.id,
    btrim(step.value ->> 'note'),
    parsed.gist,
    case when parsed.quote_ok then parsed.quote_start end,
    case when parsed.quote_ok then parsed.quote_end end
  from jsonb_array_elements(p_steps) with ordinality as step(value, ordinality)
  join public.chunks c
    on c.id = (step.value ->> 'chunk_id')::bigint
  cross join lateral public.parse_trail_step_digest(step.value, c.text) as parsed;

  perform public.link_trail_steps(p_trail_id);

  select count(*)::integer
  into v_step_count
  from public.trail_steps s
  where s.trail_id = p_trail_id;

  return v_step_count;
end;
$$;

-- ---------------------------------------------------------- create_user_link

-- Make (or re-word) a link by hand. An existing link between the same two
-- passages in the same direction is updated rather than duplicated.
create or replace function public.create_user_link(
  p_source_chunk_id bigint,
  p_target_chunk_id bigint,
  p_reason text
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_link_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_source_chunk_id is null or p_target_chunk_id is null
    or p_source_chunk_id = p_target_chunk_id then
    raise exception 'A link needs two different passages';
  end if;

  if char_length(v_reason) not between 1 and 1000 then
    raise exception 'A reason of 1-1000 characters is required';
  end if;

  if (
    select count(*)
    from public.chunks c
    join public.documents d on d.document_id = c.document_id
    where c.id in (p_source_chunk_id, p_target_chunk_id)
      and d.user_id = v_user_id
  ) <> 2 then
    raise exception 'One or more passages were not found in your library';
  end if;

  insert into public.links (user_id, source_chunk_id, target_chunk_id, reason, origin)
  values (v_user_id, p_source_chunk_id, p_target_chunk_id, v_reason, 'user')
  on conflict (user_id, source_chunk_id, target_chunk_id) do update
    set reason = excluded.reason,
        origin = 'user',
        updated_at = now()
  returning id into v_link_id;

  return v_link_id;
end;
$$;

grant execute on function public.create_user_link(bigint, bigint, text) to authenticated;

-- ---------------------------------------------------- record_link_traversal

create or replace function public.record_link_traversal(p_link_id uuid)
returns integer
language sql
volatile
security invoker
set search_path = public
as $$
  update public.links l
  set traversal_count = l.traversal_count + 1,
      last_traversed_at = now()
  where l.id = p_link_id
    and l.user_id = (select auth.uid())
  returning l.traversal_count;
$$;

grant execute on function public.record_link_traversal(uuid) to authenticated;

-- ---------------------------------------------------- get_passage_backlinks

-- Everything tied to one passage: its direct links (either direction) with
-- the passage at the other end, and every trail that passes through it with
-- the neighbouring steps for context.
create or replace function public.get_passage_backlinks(p_chunk_id bigint)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select c.id
    from public.chunks c
    join public.documents d on d.document_id = c.document_id
    where c.id = p_chunk_id
      and d.user_id = (select auth.uid())
  ),
  direct as (
    select
      l.id,
      l.reason,
      l.origin,
      l.traversal_count,
      l.updated_at,
      case when l.source_chunk_id = p_chunk_id then 'outgoing' else 'incoming' end as direction,
      case when l.source_chunk_id = p_chunk_id then l.target_chunk_id else l.source_chunk_id end as other_id
    from public.links l
    join target t on t.id in (l.source_chunk_id, l.target_chunk_id)
  ),
  passage_links as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'linkId', x.id,
          'reason', x.reason,
          'origin', x.origin,
          'traversalCount', x.traversal_count,
          'direction', x.direction,
          'passage', jsonb_build_object(
            'chunkId', c.id,
            'page', c.page,
            'content', c.text,
            'documentId', d.document_id,
            'documentTitle', d.title,
            'sourceKind', d.source_kind,
            'sourceUrl', d.source_url,
            'sourceDomain', d.source_domain,
            'sourceProvider', d.source_provider,
            'retrievedAt', d.retrieved_at
          )
        )
        order by x.traversal_count desc, x.updated_at desc
      ),
      '[]'::jsonb
    ) as value
    from (select * from direct order by traversal_count desc, updated_at desc limit 50) x
    join public.chunks c on c.id = x.other_id
    join public.documents d on d.document_id = c.document_id
  ),
  on_trails as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'trailId', tr.id,
          'title', tr.title,
          'position', s.position,
          'stepCount', (select count(*) from public.trail_steps n where n.trail_id = tr.id),
          'annotation', s.annotation,
          'previous', (
            select jsonb_build_object(
              'chunkId', pc.id,
              'documentTitle', pd.title,
              'excerpt', left(regexp_replace(pc.text, '\s+', ' ', 'g'), 200)
            )
            from public.trail_steps ps
            join public.chunks pc on pc.id = ps.chunk_id
            join public.documents pd on pd.document_id = pc.document_id
            where ps.trail_id = tr.id and ps.position = s.position - 1
          ),
          'next', (
            select jsonb_build_object(
              'chunkId', nc.id,
              'documentTitle', nd.title,
              'excerpt', left(regexp_replace(nc.text, '\s+', ' ', 'g'), 200)
            )
            from public.trail_steps ns
            join public.chunks nc on nc.id = ns.chunk_id
            join public.documents nd on nd.document_id = nc.document_id
            where ns.trail_id = tr.id and ns.position = s.position + 1
          )
        )
        order by tr.created_at desc
      ),
      '[]'::jsonb
    ) as value
    from public.trail_steps s
    join target t on t.id = s.chunk_id
    join public.trails tr on tr.id = s.trail_id
    where tr.user_id = (select auth.uid())
  )
  select case
    when exists (select 1 from target) then
      jsonb_build_object(
        'links', (select value from passage_links),
        'trails', (select value from on_trails)
      )
  end;
$$;

grant execute on function public.get_passage_backlinks(bigint) to authenticated;

-- ------------------------------------------------- publish_trail (v2)

-- Public snapshots now take each step's reason from its link, falling back to
-- the legacy note.
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
          'note', coalesce(l.reason, s.note),
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
  left join public.links l on l.id = s.link_id
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

revoke all on function public.publish_trail(uuid) from public, anon;
grant execute on function public.publish_trail(uuid) to authenticated;
