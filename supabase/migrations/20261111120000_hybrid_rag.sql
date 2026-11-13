-- memex.ai hybrid RAG provenance
--
-- Extends the existing documents/chunks vector store with provenance for
-- uploaded files, notes, and web research. Web sources are embedded into the
-- same chunks table so later questions can retrieve them locally.
--
-- Apply with the Supabase CLI (`supabase db push`) or paste this file into the
-- SQL editor. Safe to run after 20261110120000_trail_step_digest.sql.

-- ------------------------------------------------------------ provenance

alter table public.documents
  add column if not exists source_kind text not null default 'upload',
  add column if not exists source_url text,
  add column if not exists source_domain text,
  add column if not exists source_provider text,
  add column if not exists source_key text,
  add column if not exists published_at timestamptz,
  add column if not exists retrieved_at timestamptz;

alter table public.documents
  drop constraint if exists documents_source_kind_check;
alter table public.documents
  add constraint documents_source_kind_check
  check (source_kind in ('upload', 'note', 'web'));

-- Existing notes were ingested through /api/documents/note and have no
-- source_kind yet. Treat anything explicitly marked as a note as one.
update public.documents
set source_kind = 'note'
where extraction_method = 'note'
  and source_kind = 'upload';

comment on column public.documents.source_kind is
  'Where the document came from: an uploaded file, a saved note, or web research.';
comment on column public.documents.source_url is
  'Original URL for web research sources.';
comment on column public.documents.source_domain is
  'Display domain for web research sources.';
comment on column public.documents.source_provider is
  'Retrieval provider (for example, tavily).';
comment on column public.documents.source_key is
  'Stable hash of the canonical source URL, used to dedupe web research.';
comment on column public.documents.published_at is
  'Publication date reported by the source, when available.';
comment on column public.documents.retrieved_at is
  'When the web source was retrieved.';

create unique index if not exists documents_user_source_key_unique
  on public.documents (user_id, source_key)
  where source_key is not null;

create index if not exists documents_user_source_kind_idx
  on public.documents (user_id, source_kind);

-- ------------------------------------------------------- match_documents

-- Hybrid retrieval: returns the closest chunks plus document provenance, so
-- the API can label each citation as personal knowledge or web research.
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count integer default 30,
  p_source_kind text default null
)
returns table (
  chunk_id bigint,
  document_id uuid,
  title text,
  page integer,
  content text,
  similarity double precision,
  source_kind text,
  source_url text,
  source_domain text,
  source_provider text,
  published_at timestamptz,
  retrieved_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.id as chunk_id,
    c.document_id,
    d.title,
    c.page,
    c.text as content,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.source_kind,
    d.source_url,
    d.source_domain,
    d.source_provider,
    d.published_at,
    d.retrieved_at
  from public.chunks c
  join public.documents d on d.document_id = c.document_id
  where d.user_id = auth.uid()
    and (p_source_kind is null or d.source_kind = p_source_kind)
  order by c.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 100);
$$;

comment on function public.match_documents(vector, integer, text) is
  'Cosine-similarity search over the user chunks, including document provenance.';

grant execute on function public.match_documents(vector, integer, text)
  to authenticated;
