import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AdminAccessError, requireAdmin } from "@/lib/supabase/admin";
import { AdminUsers } from "./users-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/");

  let setupMessage = "";
  try { await requireAdmin(); }
  catch (error) {
    if (error instanceof AdminAccessError && error.status === 403) redirect("/");
    setupMessage = error instanceof Error ? error.message : "Admin setup is incomplete.";
  }

  return <main className="admin-shell">
    <header className="admin-topbar">
      <Link className="wordmark" href="/"><span className="brand-mark">k.</span><span>kept</span></Link>
      <Link className="quiet-button" href="/">Back to Kept</Link>
    </header>
    <section className="admin-intro">
      <p className="eyebrow">ACCOUNT CONTROL · ADMIN</p>
      <h1>People, <em>kept safe.</em></h1>
      <p>Manage access to Kept accounts. Private purchases, routines, and progress data are not shown here.</p>
    </section>
    {setupMessage ? <section className="admin-setup" role="status"><p className="eyebrow">SETUP NEEDED</p><h2>Admin access is not ready yet.</h2><p>{setupMessage}</p><p>Add your signed-in account email to <code>ADMIN_EMAILS</code> and add the Supabase service role key as <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel’s project environment variables. Keep that key server-only, then redeploy.</p></section> : <AdminUsers />}
    <footer className="admin-footer">Signed in as {user.email}</footer>
  </main>;
}
