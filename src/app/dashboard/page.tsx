import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AuthArtwork } from "@/components/art/auth-artwork";
import { BrandMark } from "@/components/auth/brand-mark";
import { PdfUploader } from "@/components/documents/pdf-uploader";
import { AlertIcon, FileTextIcon } from "@/components/ui/icons";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/ingestion/embeddings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DocumentRow = {
  document_id: string;
  title: string;
  created_at: string;
  chunks: { count: number }[] | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const pipeline = [
  { title: "Upload", detail: "Private PDF storage" },
  { title: "Extract", detail: "unpdf, page by page" },
  { title: "Chunk", detail: "500–800 tokens · 100 overlap" },
  {
    title: "Embed",
    detail: `${EMBEDDING_MODEL} · ${EMBEDDING_DIMENSIONS} dims`,
  },
  { title: "Index", detail: "pgvector · cosine distance" },
];

async function AccountEmail() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return <span className="text-[12px] text-mist-dim">Supabase not configured</span>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <span className="hidden max-w-[220px] truncate text-[12.5px] text-mist sm:inline">
      {user.email}
    </span>
  );
}

function SetupNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="workspace-panel mt-5 flex items-start gap-3 p-5">
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-amber-300/80" />
      <div>
        <p className="text-[13px] font-medium text-white">{title}</p>
        <p className="mt-1 text-[12px] leading-5 text-mist">{message}</p>
      </div>
    </div>
  );
}

function RecentDocumentsSkeleton() {
  return (
    <div className="workspace-panel mt-5 divide-y divide-white/[0.06]">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-4 px-5 py-4 sm:px-6">
          <div className="size-10 shrink-0 animate-pulse rounded-xl bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-2.5 w-1/4 animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function RecentDocuments() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <SetupNotice
        title="Supabase is not configured"
        message="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local to enable the library."
      />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data, error } = await supabase
    .from("documents")
    .select("document_id, title, created_at, chunks(count)")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    return (
      <SetupNotice
        title="Library unavailable"
        message="Apply the Supabase migration to create the documents and chunks tables, then refresh this page."
      />
    );
  }

  const documents = (data ?? []) as DocumentRow[];

  if (documents.length === 0) {
    return (
      <div className="workspace-panel mt-5 flex items-center gap-4 p-5 sm:p-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-500">
          <FileTextIcon className="size-[18px]" />
        </span>
        <div>
          <p className="text-[13px] font-medium text-neutral-200">
            No documents yet.
          </p>
          <p className="mt-0.5 text-[12px] text-mist-dim">
            Drop your first PDF above to build your library.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="workspace-panel mt-5 divide-y divide-white/[0.06] overflow-hidden">
      {documents.map((document) => {
        const chunkCount = document.chunks?.[0]?.count ?? 0;

        return (
          <li
            key={document.document_id}
            className="group flex items-center gap-4 px-5 py-4 transition hover:bg-white/[0.025] sm:px-6"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 transition group-hover:text-white">
              <FileTextIcon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-neutral-100">
                {document.title}
              </p>
              <p className="mt-0.5 text-[11.5px] text-mist-dim">
                {chunkCount.toLocaleString("en-US")} chunks ·{" "}
                {dateFormatter.format(new Date(document.created_at))}
              </p>
            </div>
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10.5px] text-neutral-300 sm:inline-flex">
              <span className="size-1.5 rounded-full bg-emerald-400/80" />
              Indexed
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <AuthArtwork />

      {/* Readability scrims: darkest on the left, softer over the convergence */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(72%_110%_at_8%_32%,rgba(10,10,10,0.96)_0%,rgba(10,10,10,0.78)_30%,rgba(10,10,10,0.24)_58%,rgba(10,10,10,0.04)_78%,rgba(10,10,10,0)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-ink-950/55 lg:bg-transparent"
      />

      <div className="relative z-20 mx-auto flex min-h-dvh w-full min-w-0 max-w-6xl flex-col px-6 pb-10 pt-8 sm:px-8 lg:px-10 lg:pt-10">
        <header className="animate-rise flex min-w-0 items-center justify-between gap-6">
          <BrandMark />

          <div className="flex min-w-0 items-center gap-3">
            <Suspense
              fallback={
                <span
                  aria-hidden="true"
                  className="hidden h-3 w-32 animate-pulse rounded-full bg-white/10 sm:block"
                />
              }
            >
              <AccountEmail />
            </Suspense>

            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>

        <section className="animate-rise mt-14 min-w-0 max-w-2xl sm:mt-20">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-mist-dim">
            Workspace
          </p>
          <h1 className="mt-4 text-[2.3rem] font-semibold leading-[1.05] tracking-[-0.045em] text-white sm:text-[2.85rem]">
            Drop in a document.
          </h1>
          <p className="mt-4 max-w-xl text-[14px] leading-7 text-mist">
            Upload a PDF and memex will extract every page, split it into
            overlapping chunks, and embed each one for semantic recall.
          </p>
        </section>

        <div className="animate-rise-delayed mt-10 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="workspace-panel min-w-0 p-5 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[13.5px] font-medium text-white">Add a PDF</p>
                <p className="mt-1 text-[12px] text-mist-dim">
                  Stored privately in your workspace.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400">
                PDF
              </span>
            </div>

            <PdfUploader />
          </section>

          <aside className="workspace-panel min-w-0 p-5 sm:p-7">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-mist-dim">
              Ingestion pipeline
            </p>

            <ol className="mt-5 space-y-4">
              {pipeline.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] font-mono text-[10px] text-neutral-400">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium text-neutral-200">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-5 text-mist-dim">
                      {step.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-6 border-t border-white/10 pt-4">
              <p className="text-[11.5px] leading-5 text-mist-dim">
                Embeddings are generated in batches of 64 before chunks are
                written to Postgres.
              </p>
              <p className="mt-2 text-[11.5px] leading-5 text-mist-dim">
                Text-layer PDFs only — scans need OCR first.
              </p>
            </div>
          </aside>
        </div>

        <section className="mt-10 min-w-0">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-medium text-white">
                Recent documents
              </h2>
              <p className="mt-1 text-[12px] text-mist-dim">
                Everything indexed in your library.
              </p>
            </div>
          </div>

          <Suspense fallback={<RecentDocumentsSkeleton />}>
            <RecentDocuments />
          </Suspense>
        </section>

        <footer className="mt-auto pt-14">
          <p className="text-[11px] text-neutral-600">
            memex.ai · private by default
          </p>
        </footer>
      </div>

      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-30"
      />
    </main>
  );
}
