import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInCard } from "@/components/auth/sign-in-card";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your memex.ai knowledge workspace.",
};

export default function SignInPage() {
  return (
    <AuthShell>
      <SignInCard />
    </AuthShell>
  );
}
