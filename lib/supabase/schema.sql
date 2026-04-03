create extension if not exists pg_trgm;
create extension if not exists vector;

create table if not exists public.evidence_import_manifests (
  id bigserial primary key,
  source_name text not null,
  source_reference text not null,
  source_year_start text not null,
  source_year_end text not null,
  event_filter text not null,
  total_rows integer not null,
  imported_rows integer not null,
  canonical_clusters integer not null,
  skipped_rows integer not null,
  imported_at timestamptz not null default now(),
  filter_settings jsonb not null default '{}'::jsonb
);

create table if not exists public.evidence_clusters (
  id text primary key,
  cluster_key text not null unique,
  bucket_id text not null default '',
  event text not null default '',
  hat text not null default '',
  block text not null default '',
  tag text not null default '',
  cite text not null default '',
  fullcite text not null default '',
  summary text not null default '',
  spoken text not null default '',
  fulltext text not null default '',
  markup text not null default '',
  rendered_markup text not null default '',
  support_count integer not null default 0,
  variant_count integer not null default 0,
  canonical_quality_score integer not null default 0,
  team_display_name text not null default '',
  school_display_name text not null default '',
  caselist_display_name text not null default '',
  tournament text not null default '',
  round text not null default '',
  opponent text not null default '',
  judge text not null default '',
  year text not null default '',
  level text not null default '',
  source_article_url text not null default '',
  source_page_url text not null default '',
  file_url text not null default '',
  embedding vector(1536),
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(tag, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(cite, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(fullcite, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(spoken, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(fulltext, '')), 'D') ||
    setweight(to_tsvector('english', coalesce(block, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(hat, '')), 'D')
  ) stored
);

create table if not exists public.evidence_variants (
  id text primary key,
  cluster_id text not null references public.evidence_clusters(id) on delete cascade,
  cluster_key text not null,
  event text not null default '',
  hat text not null default '',
  block text not null default '',
  tag text not null default '',
  cite text not null default '',
  fullcite text not null default '',
  summary text not null default '',
  spoken text not null default '',
  fulltext text not null default '',
  markup text not null default '',
  rendered_markup text not null default '',
  duplicate_count integer not null default 0,
  quality_score integer not null default 0,
  team_display_name text not null default '',
  school_display_name text not null default '',
  caselist_display_name text not null default '',
  tournament text not null default '',
  round text not null default '',
  opponent text not null default '',
  judge text not null default '',
  year text not null default '',
  level text not null default '',
  source_article_url text not null default '',
  source_page_url text not null default '',
  file_url text not null default ''
);

create index if not exists idx_evidence_clusters_event on public.evidence_clusters(event);
create index if not exists idx_evidence_clusters_support on public.evidence_clusters(support_count desc);
create index if not exists idx_evidence_clusters_year on public.evidence_clusters(year);
create index if not exists idx_evidence_clusters_search on public.evidence_clusters using gin(search_document);
create index if not exists idx_evidence_clusters_tag_trgm on public.evidence_clusters using gin(tag gin_trgm_ops);
create index if not exists idx_evidence_clusters_cite_trgm on public.evidence_clusters using gin(fullcite gin_trgm_ops);
create index if not exists idx_evidence_variants_cluster on public.evidence_variants(cluster_id);
create index if not exists idx_evidence_variants_quality on public.evidence_variants(cluster_id, quality_score desc, duplicate_count desc);

-- Optional vector index for large hosted corpora.
create index if not exists idx_evidence_clusters_embedding
  on public.evidence_clusters
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

create or replace function public.match_evidence_clusters(
  query_embedding vector(1536),
  match_count integer default 24,
  event_filter text default null
)
returns table (
  id text,
  similarity double precision
)
language sql
stable
as $$
  select
    clusters.id,
    1 - (clusters.embedding <=> query_embedding) as similarity
  from public.evidence_clusters as clusters
  where clusters.embedding is not null
    and (
      event_filter is null
      or trim(event_filter) = ''
      or lower(clusters.event) = lower(event_filter)
    )
  order by clusters.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
