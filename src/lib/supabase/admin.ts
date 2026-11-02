import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export class AdminAccessError extends Error {
  constructor(message: string, public status = 403) { super(message); }
}

/** Checks the signed-in Supabase identity before constructing a privileged client. */
export async function requireAdmin() {
  const authClient = await createClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) throw new AdminAccessError("Please sign in to continue.", 401);
  if (!user.email_confirmed_at) throw new AdminAccessError("Confirm your email before using admin access.", 403);

  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) {
    throw new AdminAccessError("This account is not enabled for admin access.", 403);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new AdminAccessError("Admin setup is incomplete. Add the server-only Supabase admin key and admin email in the deployment settings.", 503);

  return {
    user,
    supabase: createSupabaseClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

export function adminErrorResponse(error: unknown) {
  const accessError = error instanceof AdminAccessError ? error : null;
  return Response.json(
    { error: accessError?.message ?? "Could not complete the admin request." },
    { status: accessError?.status ?? 500 },
  );
}
