"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { homeFor, useSession } from "@/lib/session";

/** Entry point: send people to their own area, or to sign in. */
export default function Home() {
  const { state } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (state.status === "anon") router.replace("/login");
    if (state.status === "authed") router.replace(homeFor(state.session.role));
  }, [state, router]);
  return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
}
