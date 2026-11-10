-- memex.ai OCR metadata + ordered trail nodes
--
-- Stores the raw text produced by the browser OCR pipeline, allows image
-- uploads in the private `documents` bucket, and adds ordered trail nodes with
-- Postgres functions for appending and reordering notes.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste this file into the
-- SQL editor. Safe to run after 20261109130000_documents_chunks.sql.

-- ------------------------------------------------------- document metadata

alter table public.documents
  add column if not exists mime_type text,
  add column if not exists page_count integer,
  add column if not exists extracted_text text,
  add column if not exists extraction_method text,
  add column if not exists ocr_pages jsonb;

alter table public.documents
  drop constraint if exists documents_page_count_check;
alter table public.documents
  add constraint documents_page_count_check
  check (page_count is null or page_count >= 1);

alter table public.documents
  drop constraint if exists documents_extraction_method_check;
alter table public.documents
  add constraint documents_extraction_method_check
  check (
    extraction_method is null
    or extraction_method in ('ocr', 'text-layer', 'mixed', 'note')
  );

comment on table public.documents is
  'One row per uploaded PDF, image, or text note. document_id is the stable public identifier used by chunks, trail nodes, and the API.';
comment on column public.documents.mime_type is
  'Normalized MIME type of the stored original (application/pdf or image/*).';
comment on column public.documents.page_count is
  'Page count reported by the client extractor, or derived from the server PDF fallback.';
comment on column public.documents.extracted_text is
  'Reviewed raw text sent by the OCR pipeline. Chunks remain the searchable source of truth.';
comment on column public.documents.extraction_method is
  'How text was obtained: browser OCR, PDF text layer, mixed extraction, or a written note.';
comment on column public.documents.ocr_pages is
  'Per-page raw text and extraction method, for re-opening the OCR review.';

-- ------------------------------------------------------------- trail nodes

create table if not exists public.trail_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trail_id text not null check (char_length(trail_id) between 1 and 200),
  document_id uuid not null references public.documents (document_id) on delete cascade,
  position integer not null check (position >= 1),
  relation text,
  created_at timestamptz not null default now(),
  constraint trail_nodes_position_unique
    unique (user_id, trail_id, position) deferrable initially deferred,
  constraint trail_nodes_document_unique
    unique (user_id, trail_id, document_id)
);

comment on table public.trail_nodes is
  'Ordered notes inside an associative trail. trail_id matches the dashboard trail id, including local seed trails.';

create index if not exists trail_nodes_user_trail_position_idx
  on public.trail_nodes (user_id, trail_id, position);

create index if not exists trail_nodes_document_idx
  on public.trail_nodes (document_id);

alter table public.trail_nodes enable row level security;

drop policy if exists "Users can read their trail nodes" on public.trail_nodes;
create policy "Users can read their trail nodes"
  on public.trail_nodes for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their trail nodes" on public.trail_nodes;
create policy "Users can create their trail nodes"
  on public.trail_nodes for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can update their trail nodes" on public.trail_nodes;
create policy "Users can update their trail nodes"
  on public.trail_nodes for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their trail nodes" on public.trail_nodes;
create policy "Users can delete their trail nodes"
  on public.trail_nodes for delete
  to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.trail_nodes to authenticated;

-- Append a document to the end of a trail. The advisory lock serializes
-- concurrent uploads to the same trail; the unique document constraint makes
-- retries idempotent.
create or replace function public.append_document_to_trail(
  p_trail_id text,
  p_document_id uuid,
  p_relation text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_position integer;
  v_node_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_trail_id is null or char_length(trim(p_trail_id)) = 0 then
    raise exception 'Trail id is required';
  end if;

  if char_length(trim(p_trail_id)) > 200 then
    raise exception 'Trail id is too long';
  end if;

  if not exists (
    select 1
    from public.documents
    where document_id = p_document_id
      and user_id = v_user_id
  ) then
    raise exception 'Document not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_trail_id, 0)
  );

  select coalesce(max(position), 0) + 1
  into v_position
  from public.trail_nodes
  where user_id = v_user_id
    and trail_id = p_trail_id;

  insert into public.trail_nodes (
    user_id,
    trail_id,
    document_id,
    position,
    relation
  )
  values (
    v_user_id,
    p_trail_id,
    p_document_id,
    v_position,
    nullif(trim(p_relation), '')
  )
  on conflict (user_id, trail_id, document_id) do update
    set relation = coalesce(excluded.relation, trail_nodes.relation)
  returning id into v_node_id;

  return v_node_id;
end;
$$;

-- Read the ordered trail sequence. Includes enough document metadata for a
-- future cross-device trail view without a second query.
create or replace function public.get_trail_nodes(p_trail_id text)
returns table (
  node_id uuid,
  document_id uuid,
  title text,
  "position" integer,
  relation text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    tn.id,
    d.document_id,
    d.title,
    tn."position",
    tn.relation,
    tn.created_at
  from public.trail_nodes tn
  join public.documents d on d.document_id = tn.document_id
  where tn.user_id = (select auth.uid())
    and tn.trail_id = p_trail_id
  order by tn."position" asc;
$$;

-- Move a node and normalize the surrounding positions. The position unique
-- constraint is deferrable so the intermediate shifts are checked at commit.
create or replace function public.reorder_trail_node(
  p_node_id uuid,
  p_new_position integer
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trail_id text;
  v_current integer;
  v_count integer;
  v_target integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select trail_id, "position"
  into v_trail_id, v_current
  from public.trail_nodes
  where id = p_node_id
    and user_id = v_user_id;

  if not found then
    raise exception 'Trail node not found';
  end if;

  select count(*)
  into v_count
  from public.trail_nodes
  where user_id = v_user_id
    and trail_id = v_trail_id;

  v_target := greatest(
    1,
    least(coalesce(p_new_position, v_current), v_count)
  );

  if v_target = v_current then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || v_trail_id, 0)
  );

  if v_target < v_current then
    update public.trail_nodes
    set "position" = "position" + 1
    where user_id = v_user_id
      and trail_id = v_trail_id
      and "position" >= v_target
      and "position" < v_current;
  else
    update public.trail_nodes
    set "position" = "position" - 1
    where user_id = v_user_id
      and trail_id = v_trail_id
      and "position" > v_current
      and "position" <= v_target;
  end if;

  update public.trail_nodes
  set "position" = v_target
  where id = p_node_id
    and user_id = v_user_id;
end;
$$;

grant execute on function public.append_document_to_trail(text, uuid, text)
  to authenticated;
grant execute on function public.get_trail_nodes(text)
  to authenticated;
grant execute on function public.reorder_trail_node(uuid, integer)
  to authenticated;

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 MB, matches DOCUMENT_MAX_BYTES
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/bmp'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
