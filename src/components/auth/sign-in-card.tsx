"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useId, useState, type FormEvent } from "react";
import { isValidEmail, mapAuthError } from "@/lib/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "../ui/icons";
import { Spinner } from "../ui/spinner";
import { Field } from "./field";
import { OAuthErrorBanner } from "./oauth-error-banner";
import { SocialAuth } from "./social-auth";

type Provider = "google" | "apple";

export function SignInCard() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const configured = isSupabaseConfigured();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<Provider | null>(null);

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
      nextErrors.password = "Enter your password.";
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
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setFormError(mapAuthError(error.message));
      setPending(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
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
        ...(provider === "google"
          ? { queryParams: { prompt: "select_account" } }
          : {}),
      },
    });

    if (error) {
      setFormError(mapAuthError(error.message));
      setPendingProvider(null);
    }
  }

  return (
    <div className="auth-card p-7 sm:p-9">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[12px] tracking-wide text-mist-dim">
          <span className="size-1 rounded-full bg-neutral-300/70" />
          Secure
        </span>
      </div>

      <div className="mt-7">
        <h2 className="text-[28px] font-medium tracking-[-0.035em] text-white">
          Welcome back
        </h2>
        <p className="mt-1.5 text-[15.5px] text-mist">
          Sign in to your knowledge workspace.
        </p>
      </div>

      <Suspense fallback={null}>
        <div className="mt-6 empty:hidden">
          <OAuthErrorBanner />
        </div>
      </Suspense>

      {!configured ? (
        <div
          role="status"
          className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[14px] leading-5 text-mist"
        >
          Supabase credentials are missing. Add{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[13px] text-neutral-200">
            NEXT_PUBLIC_SUPABASE_URL
          </code>{" "}
          and{" "}
          <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[13px] text-neutral-200">
            NEXT_PUBLIC_SUPABASE_ANON_KEY
          </code>{" "}
          to <span className="font-mono text-[13px] text-neutral-200">.env.local</span>.
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
        or continue with email
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
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            if (fieldErrors.password) {
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }
          }}
          error={fieldErrors.password}
          icon={<LockIcon />}
          disabled={pending}
          action={
            <Link
              href="/forgot-password"
              className="text-[14px] text-neutral-400 transition-colors hover:text-white"
            >
              Forgot password?
            </Link>
          }
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
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[15px] text-mist">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-white underline-offset-4 transition hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
