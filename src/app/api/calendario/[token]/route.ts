import { connection, NextResponse } from "next/server";
import { loadFeed } from "@/lib/calendar/feed";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Calendário assinado (.ics). Sem sessão: quem tem o link secreto vê os voos.
 * Nunca fica em cache, para o calendário sempre receber a versão atual.
 */
const HEADERS = {
  "cache-control": "no-store, private, max-age=0",
  "x-robots-tag": "noindex, nofollow",
  "referrer-policy": "no-referrer",
};

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await ctx.params;
  const res = await loadFeed(
    createSupabaseAdminClient(),
    token,
    await getRequestOrigin(),
    new Date().toISOString(),
  );
  if (res.status === 404) {
    return new NextResponse("Calendário não encontrado.", {
      status: 404,
      headers: { ...HEADERS, "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new NextResponse(res.body, {
    headers: {
      ...HEADERS,
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="minhas-passagens.ics"',
    },
  });
}
