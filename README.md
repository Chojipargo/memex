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
- **OpenAI `text-embedding-3-small`** (1536 dimensions) via `fetch`

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the anon key and OPENAI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/sign-in`.

### Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://sapiejhntzbhtiumvxty.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
OPENAI_API_KEY=<server-only key>

# Optional; defaults shown
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# EMBEDDING_DIMENSIONS=1536
```

The **anon key is public by design**. Never expose the database password, `service_role` key, or `OPENAI_API_KEY` to the browser. If you need direct Postgres access, put the connection string in a server-only variable (see the commented `DATABASE_URL` in `.env.example`).

> Supabase Auth uses the project URL + anon key, not the `postgresql://…` connection string. The connection string is only for direct SQL clients.

Without credentials the UI still renders; auth actions and uploads show a configuration notice instead of crashing.

### Supabase dashboard setup

1. **URL + anon key** — Project Settings → API.
2. **Redirect URLs** — Authentication → URL Configuration → add:
   - `http://localhost:3000/auth/callback`
   - your production `/auth/callback`
3. **Google** — Authentication → Providers → Google. Create a Google Cloud OAuth client with redirect URI:
   `https://sapiejhntzbhtiumvxty.supabase.co/auth/v1/callback`
4. **Apple** — Authentication → Providers → Apple. Requires an Apple Developer account (Services ID, Team ID, Key ID, `.p8` key).

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

Then add `OPENAI_API_KEY` to `.env.local` and restart the dev server.

### Pipeline

`POST /api/documents/upload` accepts `multipart/form-data` with `file` (required) and `title` (optional, defaults to the file name). It runs these steps and rolls back the document row and stored PDF if any step fails:

1. **Upload** — validates the PDF signature and size, stores the raw file at `<user-id>/<document-id>.pdf` in the private bucket, and inserts the `documents` row.
2. **Extract** — `unpdf` reads the PDF page by page (`mergePages: false`). Encrypted or text-less PDFs return a 422.
3. **Chunk** — sentence-aware chunks of 500–800 cl100k_base tokens with a 100-token overlap. Chunks may span pages; each chunk is attributed to the page contributing the most tokens. A final chunk of a short document can be under 500 tokens because there is nothing left to fill it.
4. **Embed** — chunk text is embedded in batches of 64 with retries for rate limits and transient failures.
5. **Index** — vectors are validated against the configured dimensions and inserted into `chunks` in batches of 100. Embeddings are generated before any chunk rows are written.

The dashboard uploader shows upload progress, then extraction/embedding status; on success it refreshes the recent-documents list.

> If you change `EMBEDDING_DIMENSIONS`, update `vector(1536)` in the migration and re-embed existing documents. The default model (`text-embedding-3-small`) supports 1536 dimensions.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/sign-in` |
| `/sign-in` | Sign-in card (email/password, Google, Apple) |
| `/sign-up` | Account creation + email confirmation state |
| `/forgot-password` | Sends a Supabase password-reset email |
| `/reset-password` | Sets a new password from the recovery link |
| `/dashboard` | Protected workspace: PDF uploader, pipeline summary, recent documents |
| `POST /api/documents/upload` | Auth-checked ingestion pipeline |
| `/auth/callback` | OAuth / recovery code exchange |

## Structure

```
src/
├─ app/
│  ├─ api/documents/upload/route.ts  # upload → extract → chunk → embed → insert
│  ├─ auth/callback/route.ts         # exchangeCodeForSession + safe redirect
│  ├─ dashboard/                     # workspace UI + signOut action
│  ├─ sign-in|sign-up|forgot-password|reset-password/
│  └─ globals.css                    # tokens, glass surfaces, fields, grain
├─ components/
│  ├─ art/
│  │  ├─ auth-artwork.tsx            # backdrop layering, gradient, convergence glow
│  │  └─ flowing-lines.tsx           # SVG line field that merges to one stroke
│  ├─ auth/                          # shell, cards, fields, social buttons
│  ├─ documents/pdf-uploader.tsx     # drag & drop, progress, status states
│  └─ ui/                            # icons, spinner
├─ lib/
│  ├─ auth.ts                        # validation, error mapping, safe redirects
│  ├─ ingestion/
│  │  ├─ constants.ts                # limits, bucket, batch sizes, chunk window
│  │  ├─ chunk.ts                    # sentence-aware 500–800/100 overlap chunker
│  │  ├─ embeddings.ts               # OpenAI batching, retries, dimension checks
│  │  └─ pdf.ts                      # unpdf page-by-page extraction
│  └─ supabase/{client,server,proxy,config}.ts
└─ proxy.ts                          # Next 16 Proxy: session refresh + route guards
supabase/migrations/                 # pgvector tables, RLS, Storage bucket
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
