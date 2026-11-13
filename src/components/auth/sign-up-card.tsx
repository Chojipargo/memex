"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { isValidEmail, mapAuthError } from "@/lib/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from "../ui/icons";
import { Spinner } from "../ui/spinner";
import { Field } from "./field";
import { SocialAuth } from "./social-auth";

type Provider = "google";

export function SignUpCard() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();

  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const busy = pending || pendingProvider !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const nextErrors: typeof fieldErrors = {};
    if (!email.trim()) {
      nextErrors.email = "Enter your email address.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (!password) {
      nextErrors.password = "Choose a password.";
    } else if (password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }
    if (confirm !== password) {
      nextErrors.confirm = "Passwords don't match.";
    }

    setFieldErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setFormError(
        "Authentication is not configured. Add your Supabase credentials to .env.local.",
      );
      return;
    }

    setPending(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      setFormError(mapAuthError(error.message));
      setPending(false);
      return;
    }

    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setPending(false);
    setSentTo(email.trim());
  }

  async function handleProvider(provider: Provider) {
    if (busy) return;
    setFormError(null);

    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setFormError(
        "Authentication is not configured. Add your Supabase credentials to .env.local.",
      );
      return;
    }

    setPendingProvider(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
      },
    });

    if (error) {
      setFormError(mapAuthError(error.message));
      setPendingProvider(null);
    }
  }

  if (sentTo) {
    return (
      <div className="auth-card p-7 sm:p-9">
        <span className="font-mono text-[12px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <div className="mt-8 grid size-11 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300/90">
          <CheckIcon />
        </div>
        <h2 className="mt-5 text-[28px] font-medium tracking-[-0.035em] text-white">
          Check your inbox
        </h2>
        <p className="mt-2 text-[15.5px] leading-6 text-mist">
          We sent a confirmation link to{" "}
          <span className="text-white">{sentTo}</span>. Confirm your address to
          finish creating your workspace.
        </p>
        <Link href="/sign-in" className="btn-primary mt-7">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-card p-7 sm:p-9">
      <span className="font-mono text-[12px] uppercase tracking-[0.32em] text-mist-dim">
        memex.ai
      </span>

      <div className="mt-7">
        <h2 className="text-[28px] font-medium tracking-[-0.035em] text-white">
          Create your workspace
        </h2>
        <p className="mt-1.5 text-[15.5px] text-mist">
          Start building your searchable memory.
        </p>
      </div>

      {!configured ? (
        <div
          role="status"
          className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[14px] leading-5 text-mist"
        >
          Supabase credentials are missing. Add them to{" "}
          <span className="font-mono text-[13px] text-neutral-200">.env.local</span>{" "}
          to enable sign-up.
        </div>
      ) : null}

      <div className="mt-6">
        <SocialAuth
          busy={busy}
          pendingProvider={pendingProvider}
          onProvider={handleProvider}
        />
      </div>

      <div className="my-6 flex items-center gap-3 text-[13px] uppercase tracking-[0.18em] text-mist-dim">
        <span className="h-px flex-1 bg-white/10" />
        or use email
        <span className="h-px flex-1 bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
            if (fieldErrors.email) {
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }
          }}
          error={fieldErrors.email}
          icon={<MailIcon />}
          disabled={pending}
        />

        <Field
          id={passwordId}
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Create a password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (fieldErrors.password) {
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }
          }}
          error={fieldErrors.password}
          hint="At least 8 characters."
          icon={<LockIcon />}
          disabled={pending}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="grid size-8 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          }
        />

        <Field
          id={confirmId}
          label="Confirm password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(value) => {
            setConfirm(value);
            if (fieldErrors.confirm) {
              setFieldErrors((current) => ({ ...current, confirm: undefined }));
            }
          }}
          error={fieldErrors.confirm}
          icon={<LockIcon />}
          disabled={pending}
        />

        {formError ? (
          <div
            role="alert"
            className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-2.5 text-[14.5px] leading-5 text-red-200/90"
          >
            {formError}
          </div>
        ) : null}

        <button type="submit" disabled={busy} className="btn-primary">
          {pending ? (
            <>
              <Spinner />
              Creating account…
            </>
          ) : (
            "Create account"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[15px] text-mist">
        Already have an account?{" "}
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
