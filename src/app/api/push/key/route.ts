import { connection, NextResponse } from "next/server";
import { getConfig } from "@/lib/notify/config";

/** Chave pública VAPID para o navegador assinar a inscrição de push. */
export async function GET() {
  await connection(); // lido em tempo de requisição, não no build
  const { vapid_public_key } = await getConfig(["vapid_public_key"]);
  if (!vapid_public_key)
    return NextResponse.json({ error: "push não configurado" }, { status: 503 });
  return NextResponse.json({ key: vapid_public_key }, { headers: { "cache-control": "no-store" } });
}
