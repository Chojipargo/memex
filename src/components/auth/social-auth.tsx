"use client";

import { Spinner } from "../ui/spinner";
import { GoogleIcon } from "../ui/icons";

type Provider = "google";

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
    </div>
  );
}
