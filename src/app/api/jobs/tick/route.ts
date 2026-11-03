import { NextResponse, type NextRequest } from "next/server";
import { runTick } from "@/lib/jobs/tick";
import { getConfig, safeEqual } from "@/lib/notify/config";

export const maxDuration = 60;

/**
 * Chamado pelo pg_cron do Supabase a cada 5 minutos (Authorization: Bearer <jobs_secret>).
 * Grava o horário do tick, envia os avisos devidos (passagens, feriados e preços),
 * roda as checagens de preço vencidas e a limpeza diária.
 */
export async function POST(request: NextRequest) {
  const { jobs_secret } = await getConfig(["jobs_secret"]);
  const auth = request.headers.get("authorization") ?? "";
  if (!jobs_secret || !safeEqual(auth, `Bearer ${jobs_secret}`)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  try {
    return NextResponse.json(await runTick());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
