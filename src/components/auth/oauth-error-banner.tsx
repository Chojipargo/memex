"use client";

import { useSearchParams } from "next/navigation";

export function OAuthErrorBanner() {
  const searchParams = useSearchParams();

  if (!searchParams.get("error")) {
    return null;
  }

  return (
    <div
      role="alert"
      className="mb-5 rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] leading-5 text-red-200/90"
    >
      We couldn&apos;t complete that sign-in. Please try again.
    </div>
  );
}
