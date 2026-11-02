"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = { id: string; email: string | null; createdAt: string | null; lastSignInAt: string | null; bannedUntil: string | null; suspended: boolean };

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      setError("");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load accounts.");
      setUsers(result.users);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load accounts."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => { void load(); });
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  async function setAccess(account: AdminUser, suspended: boolean) {
    const action = suspended ? "suspend" : "restore access for";
    if (!window.confirm(`Are you sure you want to ${action} ${account.email ?? "this account"}?`)) return;
    setBusyId(account.id); setError("");
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${account.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update account access.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update account access."); }
    finally { setBusyId(""); setLoading(false); }
  }

  const visibleUsers = users.filter((user) => (user.email ?? "").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="admin-users" aria-labelledby="admin-users-title">
    <div className="admin-list-heading"><div><p className="eyebrow">SUPABASE ACCOUNTS</p><h2 id="admin-users-title">Users <span>{users.length}</span></h2></div><button className="button button-outline" type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading}>Refresh</button></div>
    <label className="admin-search"><span className="sr-only">Search users by email</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by email" /></label>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {loading ? <p className="admin-empty">Loading accounts…</p> : visibleUsers.length ? <div className="admin-user-list">
      {visibleUsers.map((account) => {
        const suspended = account.suspended;
        return <article className="admin-user-row" key={account.id}>
          <div className="admin-user-main"><span className={`admin-state-dot${suspended ? " is-suspended" : ""}`} aria-hidden="true" /><div><h3>{account.email || "No email on account"}</h3><p>{suspended ? "Access paused" : "Access active"} · Joined {account.createdAt ? new Date(account.createdAt).toLocaleDateString() : "date unavailable"}</p><small>Last sign-in {account.lastSignInAt ? new Date(account.lastSignInAt).toLocaleString() : "not yet"}</small></div></div>
          <button className="text-button" type="button" disabled={busyId === account.id} onClick={() => void setAccess(account, !suspended)}>{busyId === account.id ? "Saving…" : suspended ? "Restore access" : "Pause access"}</button>
        </article>;
      })}
    </div> : <p className="admin-empty">{query ? "No matching accounts." : "No accounts found."}</p>}
    <p className="admin-note">Pausing access is reversible. This page cannot open or change users’ personal records.</p>
  </section>;
}
