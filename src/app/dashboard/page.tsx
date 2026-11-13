import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AuthArtwork } from "@/components/art/auth-artwork";
import { DashboardWorkspace } from "@/components/dashboard/dashboard-workspace";
import { NoteIcon } from "@/components/ui/dashboard-icons";
import { AlertIcon, FileTextIcon } from "@/components/ui/icons";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@/lib/ingestion/embeddings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Dashboard",
};

type DocumentRow = {
  document_id: string;
  title: string;
  storage_path: string;
  created_at: string;
  source_kind: string | null;
  chunks: { count: number }[] | null;
};

/** Label for the recent-sources list, based on where the document came from. */
function documentKindLabel(document: DocumentRow): "Note" | "Image" | "PDF" | "Document" {
  if (document.source_kind === "note" || document.storage_path.startsWith("notes/")) {
    return "Note";
  }

  if (/\.(png|jpe?g|webp|bmp)$/i.test(document.storage_path)) {
    return "Image";
  }

  return /\.pdf$/i.test(document.storage_path) ? "PDF" : "Document";
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

async function AccountEmail() {
  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return <span className="text-mist-dim">Supabase not configured</span>;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <span className="truncate">{user.email}</span>;
}

function SetupNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.1] bg-white/[0.035] p-4">
      <AlertIcon className="mt-0.5 size-4 shrink-0 text-neutral-300" />
      <div>
        <p className="text-[14px] font-medium text-neutral-100">{title}</p>
        <p className="mt-1 text-[13px] leading-5 text-mist">{message}</p>
      </div>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex items-center gap-3">
          <div className="size-8 shrink-0 animate-pulse rounded-lg bg-white/[0.06]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/[0.04]" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function LibraryContent() {
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
    .select("document_id, title, storage_path, created_at, source_kind, chunks(count)")
    // Web research is saved as documents too, but this list shows the
    // reader's own uploads and notes; researched pages appear on trails.
    .neq("source_kind", "web")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    return (
      <SetupNotice
        title="Library unavailable"
        message="Apply the Supabase migrations (npx supabase db push), then refresh this page."
      />
    );
  }

  const documents = (data ?? []) as DocumentRow[];

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center">
        <FileTextIcon className="mx-auto size-4 text-neutral-500" />
        <p className="mt-2 text-[13.5px] text-neutral-400">
          The library is empty. Use Upload to add your first source.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-white/[0.055]">
      {documents.map((document) => {
        const chunkCount = document.chunks?.[0]?.count ?? 0;
        const kind = documentKindLabel(document);
        const Icon = kind === "Note" ? NoteIcon : FileTextIcon;

        return (
          <li key={document.document_id} className="group flex items-center gap-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-neutral-400 transition group-hover:text-neutral-200">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-neutral-200">
                {document.title}
              </p>
              <p className="mt-0.5 truncate text-[12px] text-neutral-500">
                {kind} ·{" "}
                {chunkCount.toLocaleString("en-US")} chunks ·{" "}
                {dateFormatter.format(new Date(document.created_at))}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-x-clip">
      <AuthArtwork />

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-[radial-gradient(100%_82%_at_50%_38%,rgba(10,10,10,0.26)_0%,rgba(10,10,10,0.58)_48%,rgba(10,10,10,0.84)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-[8%] z-10 h-[34rem] bg-[radial-gradient(50%_52%_at_50%_50%,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.015)_42%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-10 bg-gradient-to-b from-ink-950/65 via-transparent to-ink-950/85"
      />

      <DashboardWorkspace
        accountSlot={
          <Suspense
            fallback={
              <span
                aria-hidden="true"
                className="block h-2.5 w-28 animate-pulse rounded-full bg-white/10"
              />
            }
          >
            <AccountEmail />
          </Suspense>
        }
        librarySlot={
          <Suspense fallback={<LibrarySkeleton />}>
            <LibraryContent />
          </Suspense>
        }
        embeddingLabel={`${EMBEDDING_MODEL} · ${EMBEDDING_DIMENSIONS} dims`}
      />

      <div
        aria-hidden="true"
        className="grain pointer-events-none fixed inset-0 z-30"
      />
    </main>
  );
}
