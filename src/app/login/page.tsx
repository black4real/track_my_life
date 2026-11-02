import { redirect } from "next/navigation";
import { AuthPanel } from "@/app/auth-panel";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
  if (configured) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/");
  }
  const { mode } = await searchParams;
  return <AuthPanel initialMode={mode === "sign-up" ? "sign-up" : "sign-in"} />;
}
