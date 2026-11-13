# memex.ai

A dark, glassmorphic workspace for **memex.ai** — Supabase Auth over an original field of flowing lines, plus a PDF ingestion pipeline that extracts, chunks, embeds, and indexes documents with pgvector.

## Stack

- **Next.js 16.4** (App Router, Turbopack, Cache Components)
- **React 19.3** + **TypeScript**
- **Tailwind CSS v4** (CSS-first tokens in `src/app/globals.css`)
- **Supabase Auth + Storage + Postgres** via `@supabase/ssr`
- **pgvector** for chunk embeddings
- **unpdf** for server-side PDF text extraction
- **gpt-tokenizer** (cl100k_base) for exact chunk sizing
- **Gemini `gemini-embedding-001`** (1536 dimensions) for embeddings and **Claude `claude-sonnet-5-5`** for trail generation via `fetch`
- **Tavily** for web research, with retrieved pages embedded into the same pgvector store

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the anon key, GEMINI_API_KEY, and ANTHROPIC_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/sign-in`.

### Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://sapiejhntzbhtiumvxty.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
GEMINI_API_KEY=<server-only embeddings key>
ANTHROPIC_API_KEY=<server-only trail generation key>
TAVILY_API_KEY=<server-only web research key>

# Optional; defaults shown
# GEMINI_EMBEDDING_MODEL=gemini-embedding-001
# EMBEDDING_DIMENSIONS=1536
# CLAUDE_TRAIL_MODEL=claude-sonnet-5-5
# CLAUDE_TRAIL_FALLBACK_MODEL=claude-haiku-5-5
```

The **anon key is public by design**. Never expose the database password, `service_role` key, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `TAVILY_API_KEY` to the browser. If you need direct Postgres access, put the connection string in a server-only variable (see the commented `DATABASE_URL` in `.env.example`).

Claude has no embeddings API, so document, note, query, and web research embeddings stay on Gemini; Claude only writes trails. `TAVILY_API_KEY` is optional for library-only use and for direct URL extraction. Automatic fallback and topic-based manual research need it.

> Supabase Auth uses the project URL + anon key, not the `postgresql://…` connection string. The connection string is only for direct SQL clients.

Without credentials the UI still renders; auth actions and uploads show a configuration notice instead of crashing.

### Supabase dashboard setup

1. **URL + anon key** — Project Settings → API.
2. **Redirect URLs** — Authentication → URL Configuration → add:
   - `http://localhost:3000/auth/callback`
   - your production `/auth/callback`
3. **Google** — Authentication → Providers → Google. Create a Google Cloud OAuth client with redirect URI:
   `https://sapiejhntzbhtiumvxty.supabase.co/auth/v1/callback`

## Document ingestion

Apply the migration once, either with the Supabase CLI or by pasting
`supabase/migrations/20261109130000_documents_chunks.sql` into the SQL editor:

```bash
supabase init                 # once, if supabase/config.toml does not exist
supabase link --project-ref sapiejhntzbhtiumvxty
supabase db push
```

The migration:

- enables the `vector` extension;
- creates `documents` (`document_id` unique, owner-scoped `user_id`, title, storage path);
- creates `chunks` (`document_id` FK, page, text, `vector(1536)` embedding);
- adds an HNSW cosine index and RLS policies scoped through the owning document;
- creates the private `documents` Storage bucket (25 MB limit, PDF MIME only) and per-user Storage policies.

Then add `GEMINI_API_KEY` to `.env.local` and restart the dev server.

### Pipeline

`POST /api/documents/upload` accepts `multipart/form-data` with `file` (required) and `title` (optional, defaults to the file name). It runs these steps and rolls back the document row and stored PDF if any step fails:

1. **Upload** — validates the PDF signature and size, stores the raw file at `<user-id>/<document-id>.pdf` in the private bucket, and inserts the `documents` row.
2. **Extract** — `unpdf` reads the PDF page by page (`mergePages: false`). Encrypted or text-less PDFs return a 422.
3. **Chunk** — sentence-aware chunks of 500–800 cl100k_base tokens with a 100-token overlap. Chunks may span pages; each chunk is attributed to the page contributing the most tokens. A final chunk of a short document can be under 500 tokens because there is nothing left to fill it.
4. **Embed** — chunk text is embedded in batches of 64 with Gemini `gemini-embedding-001` (`RETRIEVAL_DOCUMENT`, 1536 dimensions) and retries for rate limits and transient failures. Vectors are L2-normalized for cosine search.
5. **Index** — vectors are validated against the configured dimensions and inserted into `chunks` in batches of 100. Embeddings are generated before any chunk rows are written.

The dashboard uploader shows upload progress, then extraction/embedding status; on success it refreshes the recent-documents list.

> If you change `EMBEDDING_DIMENSIONS`, update `vector(1536)` in the migration and re-embed existing documents. `gemini-embedding-001` supports 128–3072 output dimensions; the default here is 1536.

## Trail generation

Add `ANTHROPIC_API_KEY` to `.env.local`, then apply the generated-trails migration after the ingestion migrations:

```bash
supabase db push
```

`supabase/migrations/20261109170000_generated_trails.sql` creates:

- `trails` (`question`, `title`, `model`, owner-scoped `user_id`) and `trail_steps` (ordered citations into `chunks`, with a deferrable position constraint);
- RLS policies and explicit authenticated grants on both tables;
- `match_chunks(...)`, the original owner-scoped cosine search (kept for older code);
- `create_generated_trail(...)`, which verifies every cited chunk belongs to the caller and inserts the trail and steps atomically.

`supabase/migrations/20261111120000_hybrid_rag.sql` adds provenance (`source_kind`, `source_url`, `source_domain`, `source_provider`, `source_key`, `published_at`, `retrieved_at`) and `match_documents(...)`, which returns the same chunk fields plus that provenance.

`POST /api/trails` accepts `{ "question": "...", "mode"?: "auto" | "research", "url"?: "https://…" }` and streams NDJSON events:

1. **Embed the question** with Gemini `RETRIEVAL_QUERY` (ingestion and web research use `RETRIEVAL_DOCUMENT`).
2. **Retrieve** the top 30 chunks from the user's library through `match_documents`.
3. **Check coverage** — if the best cosine similarity is at least `TRAIL_COVERAGE_THRESHOLD` (default `0.6` in `src/lib/trails/generate.ts`, overridable via the `TRAIL_COVERAGE_THRESHOLD` env var; Gemini scores unrelated text around 0.45–0.52, so keep it above that), generate from the library alone.
4. **Research the web** when coverage is low or `mode` is `research`. Tavily returns page text for each result (or extracts a supplied `url`); the text is chunked, embedded, and saved as `source_kind = 'web'` documents, deduped by a canonical URL hash. Later questions can retrieve those chunks locally.
5. **Generate** 5–8 ordered steps with the Claude Messages API, structured JSON output, and retries on rate limits or transient failures. Each candidate is labelled `[web source: domain]` when applicable; the prompt treats every passage as untrusted data.
6. **Validate** the JSON server-side: unknown chunk ids and duplicates are dropped, notes are trimmed to 280 characters, and a response with fewer than 3 usable steps is retried once before returning a 502.
7. **Save atomically** through `create_generated_trail`, then return the full trail with provenance on every step.

The route streams three status events (`searching`, `researching`, `weaving`) before the final `trail` or `error` event, so the UI shows real server phases instead of guessing with timers. A missing `TAVILY_API_KEY` only blocks web research; library-only trails still work.

Generated trails are separate from the document-level `trail_nodes` used by hand-built workspace trails. A generated trail may cite several chunks from the same document.

### Continuing a trail

`supabase/migrations/20261110090000_append_trail_steps.sql` adds `append_generated_trail_steps(p_trail_id, p_steps)`. It is a security-invoker function that checks the caller owns the trail and every cited chunk, rejects passages already on the trail, takes a transaction-scoped advisory lock on the trail, and appends steps at `max(position) + n`. It returns the new step count.

`POST /api/trails/[id]/continue` accepts `{ "question": "..." }` (3–500 characters). It embeds the follow-up together with the last step's note and excerpt, retrieves about 30 candidates that are not already on the trail, and asks Claude for 2–4 new steps whose first note bridges from the current last step. If local coverage is low, it runs the same automatic web fallback before generating. It streams the same progress events and returns the full updated trail.

### Digestible steps

`supabase/migrations/20261110120000_trail_step_digest.sql` adds `gist`, `quote_start`, and `quote_end` to `trail_steps`, teaches both trail RPCs to store them, and adds `get_chunk_neighbors(p_chunk_id)`.

Each step now carries, from the same single generation or continue call:

- **Key quote**: 1–3 sentences the model copies verbatim. `locateQuote` (`src/lib/trails/quote.ts`) finds it in the chunk after normalizing whitespace, quote marks, dashes, and soft hyphens; a quote that is missing or ambiguous is dropped and the step is kept. Offsets are stored in code points (as Postgres counts them).
- **Gist**: a 1–2 sentence AI summary grounded in that passage only, shown with an "AI summary" label.
- **Full passage**: `GET /api/chunks/[id]/context` returns the chunk with its previous and next chunks, with the ~100-token chunk overlap removed at each seam.

### Provenance and citations

Every generated step now carries `sourceOrigin` (`library` or `web`), `sourceUrl`, `sourceDomain`, `sourceProvider`, and `retrievedAt`.

- **Badges** — trails, steps, and notes show monochrome `In Your Library`, `Web Synthesized`, or `Hybrid` pills. A trail is `Hybrid` when its steps mix personal and researched passages.
- **Citation drawer** — click the numbered source button on a step to open a glassmorphism side panel with the verified quote, the full retrieved passage, retrieval metadata, and an external link. Keyboard navigation (`Enter`, arrow keys) remains unchanged while the drawer is open.
- **Research dialog** — the hero, header navigation, and command palette expose **Research the web**. Enter a topic or paste a URL; the dialog shows the three live research phases and saves the sources for future local retrieval.

### Applying the hybrid migration

After the existing migrations:

```bash
supabase db push
```

Then add `TAVILY_API_KEY` to `.env.local` and restart the dev server. Without it, automatic fallback returns a clear configuration message and topic-based research is unavailable, but library-only trails and pasted-URL extraction continue to work.

Run the pure helper tests with `npm test`.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/sign-in` |
| `/sign-in` | Sign-in card (email/password, Google) |
| `/sign-up` | Account creation + email confirmation state |
| `/forgot-password` | Sends a Supabase password-reset email |
| `/reset-password` | Sets a new password from the recovery link |
| `/dashboard` | Protected workspace: PDF uploader, pipeline summary, recent documents |
| `POST /api/documents/upload` | Auth-checked ingestion pipeline |
| `POST /api/trails` | Build and save a library-first trail, streaming progress and falling back to web research |
| `GET /api/trails` | List the 50 most recent generated trails |
| `GET /api/trails/[id]` | Fetch one generated trail with its cited passages |
| `POST /api/trails/[id]/continue` | Append 2–4 follow-up steps to a generated trail |
| `GET /api/chunks/[id]/context` | A cited chunk with its previous/next chunks, overlap removed |
| `/auth/callback` | OAuth / recovery code exchange |

## Structure

```
src/
├─ app/
│  ├─ api/
│  │  ├─ documents/{upload,note}/route.ts  # ingest, chunk, embed, insert
│  │  └─ trails/route.ts, trails/[id]/route.ts  # generate, list, fetch trails
│  ├─ auth/callback/route.ts         # exchangeCodeForSession + safe redirect
│  ├─ dashboard/                     # workspace UI + signOut action
│  ├─ sign-in|sign-up|forgot-password|reset-password/
│  └─ globals.css                    # tokens, glass surfaces, fields, grain
├─ components/
│  ├─ art/
│  │  ├─ auth-artwork.tsx            # backdrop layering, gradient, convergence glow
│  │  └─ flowing-lines.tsx           # SVG line field that merges to one stroke
│  ├─ auth/                          # shell, cards, fields, social buttons
│  ├─ dashboard/                     # workspace, command palette, trail overlays
│  ├─ documents/pdf-uploader.tsx     # drag & drop, progress, status states
│  └─ ui/                            # icons, spinner
├─ lib/
│  ├─ auth.ts                        # validation, error mapping, safe redirects
│  ├─ ingestion/
│  │  ├─ constants.ts                # limits, bucket, batch sizes, chunk window
│  │  ├─ chunk.ts                    # sentence-aware 500–800/100 overlap chunker
│  │  ├─ embeddings.ts               # Gemini batching, retries, dimension checks
│  │  └─ pdf.ts                      # unpdf page-by-page extraction
│  ├─ rag/
│  │  ├─ pipeline.ts                 # library-first routing + web fallback
│  │  ├─ web.ts                      # Tavily search/extract + safe direct fetch
│  │  ├─ ingest.ts                   # chunk, embed, dedupe, persist web sources
│  │  └─ url.ts                      # canonical URLs + private-address guards
│  ├─ trails/
│  │  ├─ api.ts                      # API types, NDJSON stream parsing
│  │  ├─ generate.ts                 # prompt, structured output, retries, validation
│  │  └─ persist.ts                  # save trails + continuation steps
│  └─ supabase/{client,server,proxy,config}.ts
└─ proxy.ts                          # Next 16 Proxy: session refresh + route guards
supabase/migrations/                 # pgvector, RLS, trail tables/functions, Storage
```

## Notes

- **Next.js 16 uses `proxy.ts`**, not `middleware.ts`. Session cookies are refreshed there on every matched request, and `/dashboard` is protected. API routes perform their own auth check and return JSON 401s.
- **Cache Components is enabled.** Session-dependent dashboard sections (`AccountEmail`, `RecentDocuments`) sit inside `<Suspense>` boundaries so the static shell can prerender.
- The backdrop artwork is **original inline SVG** — no stock assets, image requests, or 3D runtime. It is tinted with `currentColor`, layered under readability scrims, and its accent lines drift slowly unless `prefers-reduced-motion` is set.
- PDFs are stored privately and accessed through user-scoped Supabase clients; no `service_role` key is used anywhere.
- Scanned PDFs with no text layer need OCR before upload.
- OAuth and password-reset emails require the redirect URLs above to be allowlisted in Supabase.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build + typecheck
npm run lint    # eslint
npm start       # serve the production build
```
