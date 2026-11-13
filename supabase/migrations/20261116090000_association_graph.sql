-- memex.ai: usage-weighted association map
--
-- The dashboard map is built from what the reader actually does, not from
-- similarity scores. An edge between two passages gets its strength from:
--
--   1. Links. Each link counts (1 + traversal_count): following it in the
--      reader or stepping along it on a trail strengthens it.
--   2. Trail co-occurrence. Passages on the same trail are associated:
--      1 for neighbouring steps, halving with each further step apart, up to
--      three steps.
--   3. Fading. Both decay by half every p_half_life_days since the link was
--      last followed (or edited) and since the trail last changed, so walked
--      paths stay strong and unused ones fade, as Bush put it, "trails that
--      are not frequently followed are prone to fade."
--
-- Nodes are the passages with the strongest total association, plus one
-- point per trail they appear on. Everything is scoped to the caller.
--
-- Safe to run after 20261115090000_step_aware_retrieval.sql.

create or replace function public.get_association_graph(
  p_node_limit integer default 40,
  p_half_life_days double precision default 30
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      least(greatest(coalesce(p_node_limit, 40), 2), 100) as node_limit,
      greatest(coalesce(p_half_life_days, 30), 1) as half_life
  ),
  link_rows as (
    select
      least(l.source_chunk_id, l.target_chunk_id) as a,
      greatest(l.source_chunk_id, l.target_chunk_id) as b,
      l.id as link_id,
      l.origin,
      l.reason,
      l.traversal_count,
      (1 + l.traversal_count) * power(
        0.5,
        extract(epoch from now() - coalesce(l.last_traversed_at, l.updated_at))
          / 86400.0 / p.half_life
      ) as strength
    from public.links l
    cross join params p
    where l.user_id = (select auth.uid())
  ),
  -- A pair can be linked in both directions; show the stronger link.
  link_pairs as (
    select
      a,
      b,
      sum(strength) as strength,
      sum(traversal_count)::integer as traversals,
      (array_agg(link_id order by strength desc))[1] as link_id,
      (array_agg(origin order by strength desc))[1] as origin,
      (array_agg(reason order by strength desc))[1] as reason
    from link_rows
    group by a, b
  ),
  step_pairs as (
    select
      least(s1.chunk_id, s2.chunk_id) as a,
      greatest(s1.chunk_id, s2.chunk_id) as b,
      power(0.5, (s2.position - s1.position) - 1)
        * power(0.5, extract(epoch from now() - t.updated_at) / 86400.0 / p.half_life)
        as weight
    from public.trail_steps s1
    join public.trail_steps s2
      on s2.trail_id = s1.trail_id
     and s2.position > s1.position
     and s2.position - s1.position <= 3
    join public.trails t on t.id = s1.trail_id
    cross join params p
    where t.user_id = (select auth.uid())
      and s1.chunk_id <> s2.chunk_id
  ),
  cooccurrence as (
    select a, b, sum(weight) as weight
    from step_pairs
    group by a, b
  ),
  edges as (
    select
      coalesce(l.a, c.a) as a,
      coalesce(l.b, c.b) as b,
      coalesce(l.strength, 0) as link_strength,
      coalesce(c.weight, 0) as cooccurrence,
      coalesce(l.strength, 0) + coalesce(c.weight, 0) as weight,
      l.link_id,
      l.origin,
      l.reason,
      coalesce(l.traversals, 0) as traversals
    from link_pairs l
    full join cooccurrence c on c.a = l.a and c.b = l.b
  ),
  appearances as (
    select s.chunk_id, count(distinct s.trail_id)::integer as trail_count
    from public.trail_steps s
    join public.trails t on t.id = s.trail_id
    where t.user_id = (select auth.uid())
    group by s.chunk_id
  ),
  node_strength as (
    select chunk_id, sum(weight) as strength
    from (
      select a as chunk_id, weight from edges
      union all
      select b as chunk_id, weight from edges
    ) as ends
    group by chunk_id
  ),
  nodes as (
    select
      n.chunk_id,
      n.strength + coalesce(ap.trail_count, 0) as score,
      coalesce(ap.trail_count, 0) as trail_count
    from node_strength n
    left join appearances ap on ap.chunk_id = n.chunk_id
    order by score desc, n.chunk_id
    limit (select node_limit from params)
  )
  select jsonb_build_object(
    'halfLifeDays', (select half_life from params),
    'nodes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'chunkId', c.id,
          'page', c.page,
          'content', c.text,
          'documentId', d.document_id,
          'documentTitle', d.title,
          'sourceKind', d.source_kind,
          'sourceUrl', d.source_url,
          'sourceDomain', d.source_domain,
          'sourceProvider', d.source_provider,
          'retrievedAt', d.retrieved_at,
          'trailCount', n.trail_count,
          'score', round(n.score::numeric, 4)
        )
        order by n.score desc, c.id
      )
      from nodes n
      join public.chunks c on c.id = n.chunk_id
      join public.documents d on d.document_id = c.document_id
    ), '[]'::jsonb),
    'edges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'source', e.a,
          'target', e.b,
          'weight', round(e.weight::numeric, 4),
          'linkStrength', round(e.link_strength::numeric, 4),
          'cooccurrence', round(e.cooccurrence::numeric, 4),
          'linkId', e.link_id,
          'origin', e.origin,
          'reason', e.reason,
          'traversalCount', e.traversals
        )
        order by e.weight desc
      )
      from edges e
      where e.a in (select chunk_id from nodes)
        and e.b in (select chunk_id from nodes)
    ), '[]'::jsonb)
  );
$$;

comment on function public.get_association_graph(integer, double precision) is
  'Usage-weighted association graph of the caller''s passages: links (by traversals) plus trail co-occurrence, both fading with a half-life in days.';

grant execute on function public.get_association_graph(integer, double precision)
  to authenticated;
