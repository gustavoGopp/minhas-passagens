"use server";
import { redirect } from "next/navigation";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInWithGoogle(formData: FormData) {
  const next = String(formData.get("next") ?? "/app");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const supabase = await createSupabaseServerClient();
  const redirectTo = new URL("/auth/callback", await getRequestOrigin());
  redirectTo.searchParams.set("next", safeNext);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirectTo.toString() },
  });
  if (error || !data.url) {
    redirect(`/login?erro=${encodeURIComponent(error?.message ?? "sem URL de login")}`);
  }
  redirect(data.url);
}
