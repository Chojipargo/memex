"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { isValidEmail, mapAuthError } from "@/lib/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { CheckIcon, MailIcon } from "../ui/icons";
import { Spinner } from "../ui/spinner";
import { Field } from "./field";

export function ForgotPasswordCard() {
  const emailId = useId();
  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    if (!email.trim() || !isValidEmail(email)) {
      setEmailError("Enter the email address linked to your account.");
      return;
    }

    setEmailError(undefined);
    setFormError(null);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setFormError(
        "Authentication is not configured. Add your Supabase credentials to .env.local.",
      );
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    setPending(false);

    if (error) {
      setFormError(mapAuthError(error.message));
      return;
    }

    setSentTo(email.trim());
  }

  if (sentTo) {
    return (
      <div className="auth-card p-7 sm:p-9">
        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <div className="mt-8 grid size-11 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300/90">
          <CheckIcon />
        </div>
        <h2 className="mt-5 text-[26px] font-medium tracking-[-0.035em] text-white">
          Check your inbox
        </h2>
        <p className="mt-2 text-[13.5px] leading-6 text-mist">
          If an account exists for{" "}
          <span className="text-white">{sentTo}</span>, we sent a link to reset
          your password.
        </p>
        <Link href="/sign-in" className="btn-primary mt-7">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card p-7 sm:p-9">
      <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-mist-dim">
        memex.ai
      </span>

      <div className="mt-7">
        <h2 className="text-[26px] font-medium tracking-[-0.035em] text-white">
          Reset your password
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-6 text-mist">
          Enter your email and we&apos;ll send you a secure reset link.
        </p>
      </div>

      {!configured ? (
        <div
          role="status"
          className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[12px] leading-5 text-mist"
        >
          Supabase credentials are missing. Add them to{" "}
          <span className="font-mono text-[11px] text-neutral-200">.env.local</span>{" "}
          to enable password resets.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
        <Field
          id={emailId}
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@memex.ai"
          value={email}
          onChange={(value) => {
            setEmail(value);
            if (emailError) setEmailError(undefined);
          }}
          error={emailError}
          icon={<MailIcon />}
          disabled={pending}
        />

        {formError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] leading-5 text-red-200/90"
          >
            {formError}
          </div>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Spinner />
              Sending link…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-mist">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="font-medium text-white underline-offset-4 transition hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
