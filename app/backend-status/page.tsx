"use client";
import { useState } from "react";
import { PublicShell } from "../public-shell";

export default function BackendStatus() {
  const [status, setStatus] = useState("Not checked");
  const [busy, setBusy] = useState(false);
  const [signin, setSignin] = useState(false);
  async function check() {
    setBusy(true); setSignin(false); setStatus("Checking protected Supabase readiness…");
    try {
      const response = await fetch("/api/v1/health?backend=supabase", { cache: "no-store", signal: AbortSignal.timeout(40000) });
      const result: unknown = await response.json();
      const error = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "The connection check failed.";
      if (response.status === 401) setSignin(true);
      setStatus(response.ok ? "Supabase connection verified. This check does not change the active database provider." : error);
    } catch { setStatus("The connection check could not complete. Try again later."); }
    finally { setBusy(false); }
  }
  return <PublicShell><main className="policy-page"><span className="public-eyebrow">OPERATIONS</span><h1>Backend readiness</h1><p>This authenticated check verifies a signed server connection to Supabase. It reads no passport records and changes no database configuration.</p><button className="public-primary" onClick={check} disabled={busy}>{busy ? "Checking…" : "Check Supabase connection"}</button><p role="status">{status}</p>{signin && <a href="/signin-with-chatgpt?return_to=%2Fbackend-status">Sign in to run this check</a>}</main></PublicShell>;
}
