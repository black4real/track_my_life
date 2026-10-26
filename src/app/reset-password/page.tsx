"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ResetPassword() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else setMessage("Your password has been updated. You can return to your library.");
    setBusy(false);
  }
  return <main className="auth-shell"><header className="auth-topbar"><Link className="wordmark" href="/"><span className="brand-mark">k.</span><span>kept</span></Link></header><section className="auth-card" aria-labelledby="reset-title"><p className="eyebrow">ACCOUNT ACCESS</p><h1 id="reset-title">Choose a new<br /><em>password.</em></h1><p className="auth-copy">Use at least 8 characters.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}{message ? <p className="auth-message" role="status">{message}</p> : null}<form onSubmit={submit} className="entry-form auth-form"><label className="field"><span>New password</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label><button className="button button-primary auth-submit" type="submit" disabled={busy || Boolean(message)}>{busy ? "Saving…" : "Save password"}<span aria-hidden="true">→</span></button>{message ? <Link className="text-button" href="/">Return to sign in</Link> : null}</form></section></main>;
}
