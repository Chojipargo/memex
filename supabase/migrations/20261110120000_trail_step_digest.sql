-- memex.ai: digestible trail steps
--
-- Adds an AI gist and a verified key-quote range to each generated trail step,
-- teaches the two trail-writing RPCs to store them, and adds a read-only RPC
-- that returns a chunk with its neighbours for the "Show full passage" view.
--
-- quote_start / quote_end are character offsets (code points, as counted by
-- char_length) into chunks.text. The server only sends offsets for quotes it
-- has located in the chunk; anything out of range is stored as null.
--
-- Safe to run after 20261110090000_append_trail_steps.sql.

-- ------------------------------------------------------------ new columns

alter table public.trail_steps
  add column if not exists gist text,
  add column if not exists quote_start integer,
  add column if not exists quote_end integer;

alter table public.trail_steps
  drop constraint if exists trail_steps_gist_length;
alter table public.trail_steps
  add constraint trail_steps_gist_length
  check (gist is null or char_length(gist) between 1 and 400);

alter table public.trail_steps
  drop constraint if exists trail_steps_quote_range;
alter table public.trail_steps
  add constraint trail_steps_quote_range
  check (
    (quote_start is null and quote_end is null)
    or (
      quote_start is not null
      and quote_end is not null
      and quote_start >= 0
      and quote_start < quote_end
    )
  );

comment on column public.trail_steps.gist is
  'AI summary (1-2 sentences) of the cited passage, grounded in that passage only.';
comment on column public.trail_steps.quote_start is
  'Start of the verified key quote in chunks.text, in characters. Null when no quote was located.';
comment on column public.trail_steps.quote_end is
  'Exclusive end of the verified key quote in chunks.text, in characters.';

-- ------------------------------------------------ step digest parsing

-- Read the optional gist and quote offsets from one p_steps element. Invalid
-- or out-of-range offsets yield quote_ok = false and are stored as null;
-- a malformed gist is dropped rather than failing the whole trail.
create or replace function public.parse_trail_step_digest(
  p_step jsonb,
  p_chunk_text text
)
returns table (
  gist text,
  quote_start integer,
  quote_end integer,
  quote_ok boolean
)
language sql
immutable
set search_path = public
as $$
  select
    case
      when jsonb_typeof(p_step -> 'gist') = 'string'
        then nullif(btrim(left(btrim(p_step ->> 'gist'), 400)), '')
    end,
    raw.qs,
    raw.qe,
    coalesce(
      raw.qs is not null
        and raw.qe is not null
        and raw.qs >= 0
        and raw.qs < raw.qe
        and raw.qe <= char_length(p_chunk_text),
      false
    )
  from (
    select
      case
        when jsonb_typeof(p_step -> 'quote_start') = 'number'
          and (p_step ->> 'quote_start') ~ '^[0-9]{1,9}$'
          then (p_step ->> 'quote_start')::integer
      end as qs,
      case
        when jsonb_typeof(p_step -> 'quote_end') = 'number'
          and (p_step ->> 'quote_end') ~ '^[0-9]{1,9}$'
          then (p_step ->> 'quote_end')::integer
      end as qe
  ) as raw;
$$;

grant execute on function public.parse_trail_step_digest(jsonb, text)
  to authenticated;

-- ------------------------------------------------- create_generated_trail

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

  return v_trail_id;
end;
$$;

-- --------------------------------------------- append_generated_trail_steps

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

  select count(*)::integer
  into v_step_count
  from public.trail_steps s
  where s.trail_id = p_trail_id;

  return v_step_count;
end;
$$;

-- ------------------------------------------------------- get_chunk_neighbors

-- The chunk itself plus the previous and next chunks of the same document.
-- Chunks are inserted in document order, so adjacent ids are adjacent text.
create or replace function public.get_chunk_neighbors(p_chunk_id bigint)
returns table (
  chunk_id bigint,
  page integer,
  content text,
  relation text
)
language sql
stable
security invoker
set search_path = public
as $$
  with target as (
    select c.id, c.document_id
    from public.chunks c
    join public.documents d on d.document_id = c.document_id
    where c.id = p_chunk_id
      and d.user_id = (select auth.uid())
  )
  select c.id, c.page, c.text, 'current'::text
  from public.chunks c
  join target t on t.id = c.id

  union all

  select * from (
    select c.id, c.page, c.text, 'previous'::text
    from public.chunks c
    join target t on t.document_id = c.document_id and c.id < t.id
    order by c.id desc
    limit 1
  ) as previous_chunk

  union all

  select * from (
    select c.id, c.page, c.text, 'next'::text
    from public.chunks c
    join target t on t.document_id = c.document_id and c.id > t.id
    order by c.id asc
    limit 1
  ) as next_chunk;
$$;

grant execute on function public.get_chunk_neighbors(bigint) to authenticated;
grant execute on function public.create_generated_trail(text, text, text, jsonb)
  to authenticated;
grant execute on function public.append_generated_trail_steps(uuid, jsonb)
  to authenticated;
