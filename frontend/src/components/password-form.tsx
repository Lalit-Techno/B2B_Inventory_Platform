"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthCard, FormError, PasswordInput } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

const MIN = 10; // same rule as the API (10 to 72 characters)

/** Shared by /set-password (invite) and /reset-password: the link carries ?token=. */
export function PasswordForm({ mode }: { mode: "set" | "reset" }) {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN) return setError(`Use at least ${MIN} characters.`);
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(undefined);
    try {
      await api(mode === "set" ? "/auth/set-password" : "/auth/reset-password", { method: "POST", body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    }
    setBusy(false);
  }

  const title = mode === "set" ? "Set your account password" : "Choose a new password";
  if (!token) {
    return (
      <AuthCard title={title}>
        <FormError message="This link is incomplete. Open the link from your e-mail again." />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title={title}
      subtitle={mode === "set" ? "Finish setting up your account. You will sign in with this password." : "Your old password stops working once you save."}
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-success-container px-3 py-2 text-sm text-success">
            Password saved. You can sign in now.
          </p>
          <Button render={<Link href="/login" />} size="lg" className="w-full">
            Go to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="New password" hint={`At least ${MIN} characters.`}>
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          </Field>
          <Field label="Confirm password">
            <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : mode === "set" ? "Activate account" : "Save password"}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
