"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function AuthPanel({ email }: { email?: string }) {
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => { queueMicrotask(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    if (new URLSearchParams(window.location.search).has("authError")) setError("Sign-in could not finish. Check the provider and redirect URL settings, then try again.");
  }); }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("kept-theme-v1", next); } catch { /* Theme still changes for this visit. */ }
    setTheme(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const address = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const supabase = createClient();
    try {
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/auth/callback?next=/reset-password` });
        if (resetError) throw resetError;
        setMessage("If that email has an invitation, a password reset link is on its way.");
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email: address, password });
        if (loginError) throw loginError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete sign in. Try again.");
    } finally { setBusy(false); }
  }

  async function signInWithGoogle() {
    setBusy(true); setError("");
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (oauthError) { setError(oauthError.message); setBusy(false); }
  }

  return <main className="auth-shell">
    <a className="skip-link" href="#sign-in-form">Skip to sign in</a>
    <header className="auth-topbar"><Link className="wordmark" href="/"><span className="brand-mark">k.</span><span>kept</span></Link><span className="topbar-note"><span className="status-dot" /> YOUR PERSONAL LEDGER</span><button className="quiet-button theme-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>{theme === "dark" ? "Light mode" : "Dark mode"}</button></header>
    <section className="auth-card" aria-labelledby="auth-title">
      <p className="eyebrow">A SMALL RECORD OF WHAT STAYS</p>
      <h1 id="auth-title">Your things,<br /><em>kept close.</em></h1>
      <p className="auth-copy">Sign in to see your library on all your devices.</p>
      {email ? <p className="auth-invite-note">You’re signed in as {email}.</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="auth-message" role="status">{message}</p> : null}
      <form id="sign-in-form" onSubmit={submit} className="entry-form auth-form">
        <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" required /></label>
        {mode === "sign-in" ? <label className="field"><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label> : null}
        {mode === "sign-in" ? <button className="text-button auth-reset" type="button" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot your password?</button> : null}
        <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "reset" ? "Send reset link" : "Sign in"}<span aria-hidden="true">→</span></button>
        {mode === "reset" ? <button className="text-button" type="button" onClick={() => { setMode("sign-in"); setError(""); setMessage(""); }}>Back to sign in</button> : null}
      </form>
      {mode === "sign-in" ? <><div className="auth-separator"><span>OR</span></div><button className="button button-outline auth-google" type="button" disabled={busy} onClick={signInWithGoogle}><GoogleMark /> Continue with Google</button></> : null}
      <p className="auth-footnote">Kept is invite-only. Ask the owner to invite your email address.</p>
    </section>
    <footer className="auth-footer"><span>kept.</span><span>A little more aware of what you own</span></footer>
  </main>;
}

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.7c3.9-3.6 6-8.8 6-14.9Z"/><path fill="#34A853" d="M24 44c5.4 0 9.9-1.8 13.2-4.8l-6.7-5c-1.8 1.2-4 1.9-6.5 1.9-5 0-9.2-3.4-10.7-8H6.4v5.1A20 20 0 0 0 24 44Z"/><path fill="#FBBC05" d="M13.3 28.1a12 12 0 0 1 0-8.2v-5.1H6.4a20 20 0 0 0 0 18.4l6.9-5.1Z"/><path fill="#EA4335" d="M24 11.9c2.9 0 5.5 1 7.5 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 6.4 14.8l6.9 5.1c1.5-4.6 5.7-8 10.7-8Z"/></svg>;
}
