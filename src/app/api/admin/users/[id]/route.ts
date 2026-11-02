import { adminErrorResponse, requireAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user: actor, supabase } = await requireAdmin();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid account." }, { status: 400 });
    if (actor.id === id) return Response.json({ error: "You can’t pause your own admin account." }, { status: 400 });
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as { suspended?: unknown }).suspended !== "boolean") {
      return Response.json({ error: "Choose whether to pause or restore access." }, { status: 400 });
    }
    const suspended = (body as { suspended: boolean }).suspended;
    const { data, error } = await supabase.auth.admin.updateUserById(id, {
      ban_duration: suspended ? "876000h" : "none",
    });
    if (error) throw error;
    return Response.json({ user: { id: data.user.id, bannedUntil: data.user.banned_until ?? null } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
