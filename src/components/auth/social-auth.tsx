"use client";

import { Spinner } from "../ui/spinner";
import { AppleIcon, GoogleIcon } from "../ui/icons";

type Provider = "google" | "apple";

type SocialAuthProps = {
  busy: boolean;
  pendingProvider: Provider | null;
  onProvider: (provider: Provider) => void;
};

export function SocialAuth({
  busy,
  pendingProvider,
  onProvider,
}: SocialAuthProps) {
  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => onProvider("google")}
        disabled={busy}
        aria-busy={pendingProvider === "google"}
        className="btn-social w-full bg-white text-[#1f1f1f] hover:bg-[#ebebeb]"
      >
        {pendingProvider === "google" ? (
          <Spinner className="text-[#1f1f1f]" />
        ) : (
          <GoogleIcon />
        )}
        <span>Sign in with Google</span>
      </button>

      <button
        type="button"
        onClick={() => onProvider("apple")}
        disabled={busy}
        aria-busy={pendingProvider === "apple"}
        className="btn-social w-full border border-white/15 bg-black text-white hover:border-white/25 hover:bg-[#0e0e0e]"
      >
        {pendingProvider === "apple" ? <Spinner /> : <AppleIcon />}
        <span>Sign in with Apple</span>
      </button>
    </div>
  );
}
