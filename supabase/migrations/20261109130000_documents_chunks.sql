-- memex.ai document ingestion
--
-- Creates the documents/chunks tables used by POST /api/documents/upload,
-- enables pgvector, adds row-level security scoped to the signed-in user, and
-- provisions the private `documents` Storage bucket.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste this file into the
-- SQL editor. The embedding dimension must match EMBEDDING_DIMENSIONS
-- (default 1536 for text-embedding-3-small).

create extension if not exists vector;

-- ---------------------------------------------------------------- documents

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  storage_path text not null,
  created_at timestamptz not null default now()
);

comment on table public.documents is
  'One row per uploaded PDF. document_id is the stable public identifier used by chunks and the API.';

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);

-- ------------------------------------------------------------------- chunks

create table if not exists public.chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (document_id) on delete cascade,
  page integer not null check (page >= 1),
  text text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

comment on table public.chunks is
  'Sentence-aware 500-800 token chunks with a 100-token overlap. Page is the majority page of the chunk.';
comment on column public.chunks.embedding is
  'OpenAI text-embedding-3-small vector. Keep vector(1536) aligned with EMBEDDING_DIMENSIONS.';

create index if not exists chunks_document_idx
  on public.chunks (document_id);

-- Approximate nearest-neighbour index used by cosine similarity search.
create index if not exists chunks_embedding_hnsw
  on public.chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------- RLS

alter table public.documents enable row level security;
alter table public.chunks enable row level security;

drop policy if exists "Users can read their documents" on public.documents;
create policy "Users can read their documents"
  on public.documents for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can create their documents" on public.documents;
create policy "Users can create their documents"
  on public.documents for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can delete their documents" on public.documents;
create policy "Users can delete their documents"
  on public.documents for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can read chunks of their documents" on public.chunks;
create policy "Users can read chunks of their documents"
  on public.chunks for select
  to authenticated
  using (
    exists (
      select 1
      from public.documents
      where documents.document_id = chunks.document_id
        and documents.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can create chunks of their documents" on public.chunks;
create policy "Users can create chunks of their documents"
  on public.chunks for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.documents
      where documents.document_id = chunks.document_id
        and documents.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete chunks of their documents" on public.chunks;
create policy "Users can delete chunks of their documents"
  on public.chunks for delete
  to authenticated
  using (
    exists (
      select 1
      from public.documents
      where documents.document_id = chunks.document_id
        and documents.user_id = (select auth.uid())
    )
  );

-- Supabase grants these by default; keep them explicit for local/self-hosted
-- databases where default privileges may differ.
grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.chunks to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ------------------------------------------------------------------ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400, -- 25 MB, matches PDF_MAX_BYTES
  array['application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their PDFs" on storage.objects;
create policy "Users can read their PDFs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their PDFs" on storage.objects;
create policy "Users can upload their PDFs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their PDFs" on storage.objects;
create policy "Users can delete their PDFs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
