"use client";

import { Eye, EyeOff, Package } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Centered card on a quiet canvas, no app chrome (auth screens). */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background px-4 py-6">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded bg-primary text-primary-foreground">
          <Package className="size-5" aria-hidden="true" />
        </span>
        <span className="font-heading text-base font-semibold">LedgerStack</span>
      </header>
      <main className="mx-auto my-auto w-full max-w-[440px] py-8">
        <section className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6 sm:p-8">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-balance text-2xl font-semibold">{title}</h1>
            {subtitle && <p className="text-pretty text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {children}
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl text-xs text-muted-foreground">LedgerStack B2B inventory platform</footer>
    </div>
  );
}

export function PasswordInput(props: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative flex items-center">
      <Input {...props} type={shown ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        aria-label={shown ? "Hide password" : "Show password"}
        onClick={() => setShown((s) => !s)}
        className="absolute right-2 rounded p-1 text-muted-foreground hover:text-foreground"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="rounded-md bg-error-container px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  ) : null;
}
