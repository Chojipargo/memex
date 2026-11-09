# memex.ai

A polished authentication experience for **memex.ai** — a dark, glassmorphic sign-in flow over an original field of flowing lines, backed by Supabase Auth.

## Stack

- **Next.js 16.4** (App Router, Turbopack, Cache Components)
- **React 19.3** + **TypeScript**
- **Tailwind CSS v4** (CSS-first tokens in `src/app/globals.css`)
- **Supabase Auth** via `@supabase/ssr`

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your anon key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/sign-in`.

### Environment

```env
NEXT_PUBLIC_SUPABASE_URL=https://sapiejhntzbhtiumvxty.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon/publishable key>
```

The **anon key is public by design**. Never expose the database password or `service_role` key to the browser. If you later need direct Postgres access, put the connection string in a server-only variable (see the commented `DATABASE_URL` in `.env.example`).

> Supabase Auth uses the project URL + anon key, not the `postgresql://…` connection string. The connection string is only for direct SQL clients.

Without credentials the UI still renders; auth actions show a configuration notice instead of crashing.

### Supabase dashboard setup

1. **URL + anon key** — Project Settings → API.
2. **Redirect URLs** — Authentication → URL Configuration → add:
   - `http://localhost:3000/auth/callback`
   - your production `/auth/callback`
3. **Google** — Authentication → Providers → Google. Create a Google Cloud OAuth client with redirect URI:
   `https://sapiejhntzbhtiumvxty.supabase.co/auth/v1/callback`
4. **Apple** — Authentication → Providers → Apple. Requires an Apple Developer account (Services ID, Team ID, Key ID, `.p8` key).

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Redirects to `/sign-in` |
| `/sign-in` | Sign-in card (email/password, Google, Apple) |
| `/sign-up` | Account creation + email confirmation state |
| `/forgot-password` | Sends a Supabase password-reset email |
| `/reset-password` | Sets a new password from the recovery link |
| `/dashboard` | Protected placeholder; sign-out server action |
| `/auth/callback` | OAuth / recovery code exchange |

## Structure

```
src/
├─ app/
│  ├─ auth/callback/route.ts     # exchangeCodeForSession + safe redirect
│  ├─ dashboard/                 # protected placeholder + signOut action
│  ├─ sign-in|sign-up|forgot-password|reset-password/
│  └─ globals.css                # design tokens, glass, fields, buttons, grain
├─ components/
│  ├─ art/
│  │  ├─ auth-artwork.tsx        # background layering, gradient, convergence glow
│  │  └─ flowing-lines.tsx       # original SVG line field that merges to one stroke
│  ├─ auth/                      # shell, cards, fields, social buttons
│  └─ ui/                        # icons, spinner
├─ lib/
│  ├─ auth.ts                    # validation, error mapping, safe redirects
│  └─ supabase/{client,server,proxy,config}.ts
└─ proxy.ts                      # Next 16 Proxy: session refresh + route guards
```

## Notes

- **Next.js 16 uses `proxy.ts`**, not `middleware.ts`. Session cookies are refreshed there on every matched request.
- **Cache Components is enabled.** The dashboard reads the session inside a `<Suspense>` boundary so the static shell can prerender.
- The backdrop artwork is **original inline SVG** — no stock assets, image requests, or 3D runtime. It is tinted with `currentColor`, layered under the readability scrims, and its accent lines drift slowly unless `prefers-reduced-motion` is set.
- OAuth and password-reset emails require the redirect URLs above to be allowlisted in Supabase.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build + typecheck
npm run lint    # eslint
npm start       # serve the production build
```
