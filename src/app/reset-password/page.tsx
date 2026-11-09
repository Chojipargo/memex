import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordCard } from "@/components/auth/reset-password-card";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your memex.ai account.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <ResetPasswordCard />
    </AuthShell>
  );
}
