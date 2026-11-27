"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthCard, FormError, PasswordInput } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { homeFor, useSession } from "@/lib/session";

export default function LoginPage() {
  const { state, login } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  // Already signed in (e.g. after the silent refresh): go to the role's area.
  useEffect(() => {
    if (state.status === "authed") router.replace(homeFor(state.session.role));
  }, [state, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const s = await login(email.trim(), password);
      router.replace(homeFor(s.role));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code !== "NETWORK" && err.code !== "INTERNAL"
          ? err.message
          : "Cannot sign in right now. Try again.",
      );
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Sign in to LedgerStack" subtitle="Enter your registered e-mail and password to open your workspace.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="E-mail">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="name@company.in"
            required
          />
        </Field>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-xs font-medium">
              Password
            </label>
            <Link href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        <FormError message={error} />
        <Button type="submit" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in to workspace"}
        </Button>
      </form>
    </AuthCard>
  );
}
