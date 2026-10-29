import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth/current-user";
import { listOverrides } from "@/lib/holidays/repo";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { getProfile } from "@/lib/profiles/repo";

/** Exporta os dados do usuário em JSON (sem chaves de API). */
export async function GET() {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const [profile, integrations, holidayOverrides] = await Promise.all([
    getProfile(user.id),
    listIntegrationsPublic(user.id),
    listOverrides(user.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    user: { id: user.id, email: user.email, name: user.name },
    profile,
    integrations,
    holiday_overrides: holidayOverrides,
    // Próximos marcos acrescentam: bookings, flights, refunds_credits, price_monitors.
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="minhas-passagens-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
