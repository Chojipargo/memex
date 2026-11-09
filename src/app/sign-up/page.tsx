import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpCard } from "@/components/auth/sign-up-card";

export const metadata: Metadata = {
  title: "Create account",
  description: "Create your memex.ai knowledge workspace.",
};

export default function SignUpPage() {
  return (
    <AuthShell>
      <SignUpCard />
    </AuthShell>
  );
}
