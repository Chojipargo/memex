-- memex.ai: continue a generated trail
--
-- Appends follow-up steps to the end of an existing generated trail. Runs as
-- the caller (security invoker), so RLS on trails, trail_steps, chunks, and
-- documents still applies; ownership is also checked explicitly below.
--
-- Safe to run after 20261109170000_generated_trails.sql.

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

  -- Serialize concurrent continuations of the same trail so positions stay
  -- contiguous and the duplicate check below sees committed steps.
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
    note
  )
  select
    p_trail_id,
    v_user_id,
    v_max_position + step.ordinality::integer,
    (step.value ->> 'chunk_id')::bigint,
    btrim(step.value ->> 'note')
  from jsonb_array_elements(p_steps) with ordinality as step(value, ordinality);

  select count(*)::integer
  into v_step_count
  from public.trail_steps s
  where s.trail_id = p_trail_id;

  return v_step_count;
end;
$$;

grant execute on function public.append_generated_trail_steps(uuid, jsonb)
  to authenticated;
