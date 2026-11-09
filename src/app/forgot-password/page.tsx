import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordCard } from "@/components/auth/forgot-password-card";

export const metadata: Metadata = {
  title: "Reset password",
  description: "Request a secure password reset link for your memex.ai account.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <ForgotPasswordCard />
    </AuthShell>
  );
}
