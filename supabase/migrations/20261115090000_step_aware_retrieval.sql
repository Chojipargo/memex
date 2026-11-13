-- memex.ai: step-aware retrieval
--
-- Continuing a trail now searches from the current step's passage itself,
-- not only from the reader's question. match_documents_near_chunk looks up
-- the passage's stored embedding (so the vector never travels to the app)
-- and returns its nearest neighbours with the same columns and HNSW settings
-- as match_documents. The app fuses this list with the question search using
-- Reciprocal Rank Fusion.
--
-- Safe to run after 20261114120000_trail_editing.sql.

create or replace function public.match_documents_near_chunk(
  p_chunk_id bigint,
  match_count integer default 30
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
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
declare
  v_embedding vector(1536);
  v_limit integer := least(greatest(coalesce(match_count, 30), 1), 99);
begin
  select c.embedding
  into v_embedding
  from public.chunks c
  join public.documents d on d.document_id = c.document_id
  where c.id = p_chunk_id
    and d.user_id = (select auth.uid());

  -- Not found, or not the caller's passage.
  if v_embedding is null then
    return;
  end if;

  return query
  select m.*
  from public.match_documents(v_embedding, v_limit + 1) m
  where m.chunk_id <> p_chunk_id
  limit v_limit;
end;
$$;

comment on function public.match_documents_near_chunk(bigint, integer) is
  'Nearest passages to one of the caller''s passages, by its stored embedding. Excludes the passage itself.';

grant execute on function public.match_documents_near_chunk(bigint, integer)
  to authenticated;
