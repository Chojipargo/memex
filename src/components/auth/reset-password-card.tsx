"use client";

import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { mapAuthError } from "@/lib/auth";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { CheckIcon, LockIcon } from "../ui/icons";
import { Spinner } from "../ui/spinner";
import { Field } from "./field";

type Status = "checking" | "ready" | "invalid";

export function ResetPasswordCard() {
  const passwordId = useId();
  const confirmId = useId();
  const [status, setStatus] = useState<Status>(() =>
    isSupabaseConfigured() ? "checking" : "invalid",
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    password?: string;
    confirm?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createBrowserSupabaseClient();

    if (!supabase) {
      return;
    }

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setStatus(data.user ? "ready" : "invalid");
      })
      .catch(() => {
        if (active) setStatus("invalid");
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const nextErrors: typeof fieldErrors = {};
    if (password.length < 8) {
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
      setFormError("Authentication is not configured.");
      return;
    }

    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (error) {
      setFormError(mapAuthError(error.message));
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="auth-card p-7 sm:p-9">
        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <div className="mt-8 grid size-11 place-items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300/90">
          <CheckIcon />
        </div>
        <h2 className="mt-5 text-[26px] font-medium tracking-[-0.035em] text-white">
          Password updated
        </h2>
        <p className="mt-2 text-[13.5px] leading-6 text-mist">
          Your workspace is ready. Continue to your dashboard.
        </p>
        <Link href="/dashboard" className="btn-primary mt-7">
          Continue
        </Link>
      </div>
    );
  }

  if (status === "checking") {
    return (
      <div className="auth-card p-7 sm:p-9">
        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <div className="mt-8 flex items-center gap-2.5 text-[13px] text-mist">
          <Spinner />
          Verifying your reset link…
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="auth-card p-7 sm:p-9">
        <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-mist-dim">
          memex.ai
        </span>
        <h2 className="mt-7 text-[26px] font-medium tracking-[-0.035em] text-white">
          Link expired
        </h2>
        <p className="mt-2 text-[13.5px] leading-6 text-mist">
          This reset link is invalid or has expired. Request a fresh one to
          continue.
        </p>
        <Link href="/forgot-password" className="btn-primary mt-7">
          Request a new link
        </Link>
        <p className="mt-6 text-center text-[13px] text-mist">
          <Link
            href="/sign-in"
            className="font-medium text-white underline-offset-4 transition hover:underline"
          >
            Back to sign in
          </Link>
        </p>
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
          Choose a new password
        </h2>
        <p className="mt-1.5 text-[13.5px] text-mist">
          Pick something strong you haven&apos;t used before.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-4">
        <Field
          id={passwordId}
          label="New password"
          type="password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
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
        />

        <Field
          id={confirmId}
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          placeholder="Repeat your new password"
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
            className="rounded-xl border border-red-400/20 bg-red-500/[0.07] px-3 py-2.5 text-[12.5px] leading-5 text-red-200/90"
          >
            {formError}
          </div>
        ) : null}

        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? (
            <>
              <Spinner />
              Updating…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </div>
  );
}
