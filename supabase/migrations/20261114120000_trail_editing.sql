-- memex.ai: editable trails and side trails
--
-- Trails become editable: steps can be inserted, dropped, reordered, and
-- annotated, and any step can start a side trail. Every edit goes through
-- rewrite_trail, which takes the whole new order and keeps the chain of
-- links valid: each step after the first always points at the link from
-- the step before it.
--
-- Also retires the document-level hand-built trails (trail_nodes and its
-- functions). Generated trails replaced them; nothing reads them any more.
--
-- Safe to run after 20261114090000_associative_links.sql.

-- ----------------------------------------------------------- side trails

alter table public.trails
  add column if not exists parent_trail_id uuid references public.trails (id) on delete set null,
  add column if not exists branch_from_step_id uuid references public.trail_steps (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.trails.parent_trail_id is
  'For a side trail: the trail it branched from.';
comment on column public.trails.branch_from_step_id is
  'For a side trail: the step of the parent trail it started at.';
comment on column public.trails.updated_at is
  'Last time the trail''s steps or annotations changed.';

create index if not exists trails_parent_idx on public.trails (parent_trail_id);

-- -------------------------------------------------------------- rewrite_trail

-- Replace a trail's steps with a new order of passages.
--
-- p_expected_chunk_ids is the order the caller was looking at; the edit is
-- refused if the trail changed since. p_steps is the full new order:
--   [{ "chunk_id": 1, "reason": "...", "reason_origin": "user" | "claude_accepted" }, ...]
-- "reason" is the reason for the link from the previous step and is ignored
-- on the first step. It is required wherever no link exists yet between the
-- two passages; where one exists, a different reason re-words it.
--
-- Steps that stay keep their gist, quote, and annotation. Dropped steps are
-- deleted (their links remain, since other trails may use them).
create or replace function public.rewrite_trail(
  p_trail_id uuid,
  p_expected_chunk_ids bigint[],
  p_steps jsonb
)
returns integer
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current bigint[];
  v_new bigint[];
  v_count integer;
  v_reason text;
  v_origin text;
  v_link_id uuid;
  v_existing_reason text;
  i integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.trails t
    where t.id = p_trail_id and t.user_id = v_user_id
  ) then
    raise exception 'Trail not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_trail_id::text, 0));

  select coalesce(array_agg(s.chunk_id order by s.position), '{}')
  into v_current
  from public.trail_steps s
  where s.trail_id = p_trail_id;

  if v_current is distinct from coalesce(p_expected_chunk_ids, '{}') then
    raise exception 'This trail changed since you opened it. Reload it and try again.';
  end if;

  if p_steps is null or jsonb_typeof(p_steps) <> 'array' then
    raise exception 'Steps must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_steps);

  if v_count < 1 or v_count > 40 then
    raise exception 'A trail must have between 1 and 40 steps';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as step(value)
    where jsonb_typeof(step.value) is distinct from 'object'
      or (step.value ->> 'chunk_id') is null
      or (step.value ->> 'chunk_id') !~ '^[0-9]{1,15}$'
      or (step.value ? 'reason'
          and jsonb_typeof(step.value -> 'reason') not in ('string', 'null'))
      or char_length(btrim(coalesce(step.value ->> 'reason', ''))) > 1000
      or coalesce(step.value ->> 'reason_origin', 'user') not in ('user', 'claude_accepted')
  ) then
    raise exception 'Each step needs a chunk_id, and reasons are limited to 1000 characters';
  end if;

  select array_agg((step.value ->> 'chunk_id')::bigint order by step.ordinality)
  into v_new
  from jsonb_array_elements(p_steps) with ordinality as step(value, ordinality);

  if (select count(distinct x) from unnest(v_new) as x) <> v_count then
    raise exception 'A passage can only appear once in a trail';
  end if;

  if (
    select count(*)
    from public.chunks c
    join public.documents d on d.document_id = c.document_id
    where c.id = any (v_new)
      and d.user_id = v_user_id
  ) <> v_count then
    raise exception 'One or more passages were not found in your library';
  end if;

  delete from public.trail_steps s
  where s.trail_id = p_trail_id
    and s.chunk_id <> all (v_new);

  -- Positions are unique per trail but the constraint is deferred, so steps
  -- can swap places within this transaction.
  update public.trail_steps s
  set position = x.ordinality::integer,
      link_id = null
  from unnest(v_new) with ordinality as x(chunk_id, ordinality)
  where s.trail_id = p_trail_id
    and s.chunk_id = x.chunk_id;

  insert into public.trail_steps (trail_id, user_id, position, chunk_id, note)
  select
    p_trail_id,
    v_user_id,
    x.ordinality::integer,
    x.chunk_id,
    coalesce(
      nullif(btrim(p_steps -> (x.ordinality::integer - 1) ->> 'reason'), ''),
      'Added to this trail by hand.'
    )
  from unnest(v_new) with ordinality as x(chunk_id, ordinality)
  where not exists (
    select 1 from public.trail_steps s
    where s.trail_id = p_trail_id and s.chunk_id = x.chunk_id
  );

  -- A step that has just become the start no longer follows anything, so its
  -- old "why it follows" note would be wrong.
  if v_current[1] is distinct from v_new[1] then
    update public.trail_steps s
    set note = 'Where this trail begins.'
    where s.trail_id = p_trail_id
      and s.chunk_id = v_new[1];
  end if;

  for i in 2..v_count loop
    v_reason := nullif(btrim(p_steps -> (i - 1) ->> 'reason'), '');
    v_origin := coalesce(p_steps -> (i - 1) ->> 'reason_origin', 'user');
    v_link_id := null;
    v_existing_reason := null;

    select l.id, l.reason
    into v_link_id, v_existing_reason
    from public.links l
    where l.user_id = v_user_id
      and l.source_chunk_id = v_new[i - 1]
      and l.target_chunk_id = v_new[i];

    if v_link_id is null then
      if v_reason is null then
        raise exception 'Say why step % follows step %', i, i - 1;
      end if;

      insert into public.links (user_id, source_chunk_id, target_chunk_id, reason, origin)
      values (v_user_id, v_new[i - 1], v_new[i], v_reason, v_origin)
      returning id into v_link_id;
    elsif v_reason is not null and v_reason <> v_existing_reason then
      update public.links l
      set reason = v_reason,
          origin = v_origin,
          updated_at = now()
      where l.id = v_link_id;
    end if;

    update public.trail_steps s
    set link_id = v_link_id
    where s.trail_id = p_trail_id
      and s.chunk_id = v_new[i];
  end loop;

  update public.trails t
  set updated_at = now()
  where t.id = p_trail_id;

  return v_count;
end;
$$;

grant execute on function public.rewrite_trail(uuid, bigint[], jsonb) to authenticated;

-- ---------------------------------------------------------- start_side_trail

-- Start a new trail at one step of an existing trail. The new trail's first
-- step is that passage, with its gist and quote; the reader continues it from
-- there.
create or replace function public.start_side_trail(
  p_trail_id uuid,
  p_position integer
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_parent public.trails%rowtype;
  v_step public.trail_steps%rowtype;
  v_document_title text;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select t.* into v_parent
  from public.trails t
  where t.id = p_trail_id and t.user_id = v_user_id;

  if not found then
    raise exception 'Trail not found';
  end if;

  select s.* into v_step
  from public.trail_steps s
  where s.trail_id = p_trail_id and s.position = p_position;

  if not found then
    raise exception 'Step not found';
  end if;

  select d.title into v_document_title
  from public.chunks c
  join public.documents d on d.document_id = c.document_id
  where c.id = v_step.chunk_id;

  insert into public.trails (
    user_id, question, title, model, parent_trail_id, branch_from_step_id
  )
  values (
    v_user_id,
    v_parent.question,
    left('Side trail: ' || coalesce(v_document_title, v_parent.title), 200),
    'side-trail',
    v_parent.id,
    v_step.id
  )
  returning id into v_new_id;

  insert into public.trail_steps (
    trail_id, user_id, position, chunk_id, note, gist, quote_start, quote_end
  )
  values (
    v_new_id,
    v_user_id,
    1,
    v_step.chunk_id,
    left('Branched from step ' || p_position || ' of "' || v_parent.title || '".', 1000),
    v_step.gist,
    v_step.quote_start,
    v_step.quote_end
  );

  return v_new_id;
end;
$$;

grant execute on function public.start_side_trail(uuid, integer) to authenticated;

-- ---------------------------------------------- annotations bump updated_at

create or replace function public.touch_trail_on_annotation()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.annotation is distinct from old.annotation then
    update public.trails t set updated_at = now() where t.id = new.trail_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trail_steps_touch_annotation on public.trail_steps;
create trigger trail_steps_touch_annotation
  after update of annotation on public.trail_steps
  for each row execute function public.touch_trail_on_annotation();

-- Continuations change the steps too.
create or replace function public.touch_trail_on_step_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.trails t set updated_at = now() where t.id = new.trail_id;
  return new;
end;
$$;

drop trigger if exists trail_steps_touch_insert on public.trail_steps;
create trigger trail_steps_touch_insert
  after insert on public.trail_steps
  for each row execute function public.touch_trail_on_step_insert();

-- ------------------------------------------------- retire hand-built trails

drop function if exists public.append_document_to_trail(text, uuid, text);
drop function if exists public.get_trail_nodes(text);
drop function if exists public.reorder_trail_node(uuid, integer);
drop table if exists public.trail_nodes;
