import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Tudo, exceto estáticos, imagens e webhooks autenticados por segredo próprio.
    "/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|api/jobs|api/inbound|api/telegram|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
