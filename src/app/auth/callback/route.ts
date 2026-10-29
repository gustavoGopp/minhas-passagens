import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Troca o código do OAuth por uma sessão e segue para o app. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/app";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/app";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
    return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=${encodeURIComponent("código ausente")}`);
}
