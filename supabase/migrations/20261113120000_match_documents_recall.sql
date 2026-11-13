-- memex.ai: keep library search complete when many users share the index
--
-- match_documents orders by the HNSW index and filters to auth.uid()
-- afterwards. With the default hnsw.ef_search of 40, the index returns the 40
-- nearest chunks across *all* users and only then drops other users' rows, so
-- once the table holds several libraries a user can get far fewer than
-- match_count results (often none). Too few matches look like low coverage
-- and trigger web research the user didn't need.
--
-- This version:
--   * widens the candidate pool (ef_search 400, up from the default 40 and
--     the 200 the older match_chunks used);
--   * on pgvector 0.8+, enables iterative index scans so the index keeps
--     searching until enough of the caller's own rows pass the filter;
--   * re-sorts the relaxed-order results by exact distance.
--
-- Same signature and return type, so callers are unchanged.

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
language plpgsql
volatile
security invoker
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(match_count, 30), 1), 100);
begin
  -- Transaction-local settings; they do not leak into other requests.
  perform set_config('hnsw.ef_search', '400', true);

  -- Iterative scans arrived in pgvector 0.8.0. Older versions reject the
  -- setting, in which case the wider ef_search above still applies.
  begin
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
    perform set_config('hnsw.max_scan_tuples', '40000', true);
  exception
    -- undefined_object, invalid_name, or invalid_parameter_value depending
    -- on the Postgres and pgvector versions.
    when others then
      null;
  end;

  return query
  with nearest as materialized (
    select
      c.id as chunk_id,
      c.document_id,
      d.title,
      c.page,
      c.text as content,
      c.embedding <=> query_embedding as distance,
      d.source_kind,
      d.source_url,
      d.source_domain,
      d.source_provider,
      d.published_at,
      d.retrieved_at
    from public.chunks c
    join public.documents d on d.document_id = c.document_id
    where d.user_id = (select auth.uid())
      and (p_source_kind is null or d.source_kind = p_source_kind)
    order by c.embedding <=> query_embedding
    limit v_limit
  )
  select
    n.chunk_id,
    n.document_id,
    n.title,
    n.page,
    n.content,
    (1 - n.distance)::double precision as similarity,
    n.source_kind,
    n.source_url,
    n.source_domain,
    n.source_provider,
    n.published_at,
    n.retrieved_at
  from nearest n
  order by n.distance;
end;
$$;

comment on function public.match_documents(vector, integer, text) is
  'Cosine-similarity search over the caller''s chunks with document provenance. Uses a wide, iterative HNSW scan so per-user filtering does not starve results.';

grant execute on function public.match_documents(vector, integer, text)
  to authenticated;
