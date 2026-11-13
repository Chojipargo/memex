-- memex.ai generated trails
--
-- Stores question-driven trails that cite one or more chunks from the user's
-- own library. Generated trails are intentionally separate from the
-- document-level trail_nodes used by hand-built workspace trails.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste this file into the
-- SQL editor. Safe to run after 20261109160000_ocr_trail_nodes.sql.

-- ------------------------------------------------------------------- trails

create table if not exists public.trails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 1000),
  title text not null check (char_length(title) between 1 and 200),
  model text not null check (char_length(model) between 1 and 200),
  created_at timestamptz not null default now()
);

comment on table public.trails is
  'One row per generated trail. question is the user prompt that produced the ordered path.';
comment on column public.trails.model is
  'Claude model id used to generate the trail, recorded for reproducibility.';

create index if not exists trails_user_created_idx
  on public.trails (user_id, created_at desc);

-- -------------------------------------------------------------- trail steps

create table if not exists public.trail_steps (
  id uuid primary key default gen_random_uuid(),
  trail_id uuid not null references public.trails (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null check (position >= 1),
  chunk_id bigint not null references public.chunks (id) on delete cascade,
  note text not null check (char_length(note) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint trail_steps_position_unique
    unique (trail_id, position) deferrable initially deferred
);

comment on table public.trail_steps is
  'Ordered citations inside a generated trail. position is 1-based and unique per trail.';
comment on column public.trail_steps.note is
  'One-sentence model note explaining why this step follows the previous one.';

create index if not exists trail_steps_trail_position_idx
  on public.trail_steps (trail_id, position);

create index if not exists trail_steps_chunk_idx
  on public.trail_steps (chunk_id);

-- ---------------------------------------------------------------------- RLS

alter table public.trails enable row level security;
alter table public.trail_steps enable row level security;

drop policy if exists "Users can read their generated trails" on public.trails;
create policy "Users can read their generated trails"
  on public.trails for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their generated trails" on public.trails;
create policy "Users can create their generated trails"
  on public.trails for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their generated trails" on public.trails;
create policy "Users can update their generated trails"
  on public.trails for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their generated trails" on public.trails;
create policy "Users can delete their generated trails"
  on public.trails for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read their trail steps" on public.trail_steps;
create policy "Users can read their trail steps"
  on public.trail_steps for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their trail steps" on public.trail_steps;
create policy "Users can create their trail steps"
  on public.trail_steps for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their trail steps" on public.trail_steps;
create policy "Users can update their trail steps"
  on public.trail_steps for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their trail steps" on public.trail_steps;
create policy "Users can delete their trail steps"
  on public.trail_steps for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.trails to authenticated;
grant select, insert, update, delete on public.trail_steps to authenticated;

-- ------------------------------------------------------------- retrieval RPC

-- Top-N user-owned chunks by cosine similarity. The higher ef_search keeps
-- enough candidates available after Postgres filters by document owner.
--
-- ef_search is set at call time with set_config(..., true) (transaction-local)
-- rather than with a function-level `set hnsw.ef_search = 200` clause:
-- attaching an extension parameter to a function definition requires a
-- privilege that Supabase's postgres role does not have
-- (42501: permission denied to set parameter "hnsw.ef_search").
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count integer default 30
)
returns table (
  chunk_id bigint,
  document_id uuid,
  title text,
  page integer,
  content text,
  similarity double precision
)
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
begin
  perform set_config('hnsw.ef_search', '200', true);

  return query
  select
    c.id,
    d.document_id,
    d.title,
    c.page,
    c.text,
    (1 - (c.embedding <=> query_embedding))::double precision
  from public.chunks c
  join public.documents d on d.document_id = c.document_id
  where d.user_id = (select auth.uid())
  order by c.embedding <=> query_embedding
  limit greatest(1, least(coalesce(match_count, 30), 100));
end;
$$;

-- Persist a generated trail and its ordered steps atomically. Ownership is
-- checked again here even though match_chunks already filters by user.
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
    note
  )
  select
    v_trail_id,
    v_user_id,
    step.ordinality::integer,
    (step.value ->> 'chunk_id')::bigint,
    btrim(step.value ->> 'note')
  from jsonb_array_elements(p_steps) with ordinality as step(value, ordinality);

  return v_trail_id;
end;
$$;

grant execute on function public.match_chunks(vector, integer) to authenticated;
grant execute on function public.create_generated_trail(text, text, text, jsonb)
  to authenticated;
