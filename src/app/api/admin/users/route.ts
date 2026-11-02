import { adminErrorResponse, requireAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw error;
    return Response.json({ users: data.users.map((user) => ({
      id: user.id, email: user.email ?? null, createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null, bannedUntil: user.banned_until ?? null,
      suspended: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
    })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
