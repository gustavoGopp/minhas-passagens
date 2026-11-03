import { NextResponse } from "next/server";
import { EXTRA_EXPORT_COLUMNS } from "@/lib/account/export-tables";
import { getOptionalUser } from "@/lib/auth/current-user";
import { listOverrides } from "@/lib/holidays/repo";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listTrips } from "@/lib/trips/repo";
import { listCredits } from "@/lib/trips/credits-repo";

/** Exporta todos os dados do usuário em JSON (sem chaves nem segredos). */
export async function GET() {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const supabase = await createSupabaseServerClient();
  const [profile, integrations, holidayOverrides, trips, credits, ...extra] = await Promise.all([
    getProfile(user.id),
    listIntegrationsPublic(user.id),
    listOverrides(user.id),
    listTrips(user.id),
    listCredits(user.id),
    ...Object.entries(EXTRA_EXPORT_COLUMNS).map(async ([table, cols]) => {
      const { data, error } = await supabase.from(table).select(cols).eq("user_id", user.id);
      if (error) throw new Error(`Falha ao exportar ${table}: ${error.message}`);
      return [table, data ?? []] as const;
    }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    schema_version: 2,
    user: { id: user.id, email: user.email, name: user.name },
    profile,
    integrations,
    holiday_overrides: holidayOverrides,
    bookings: trips.bookings,
    flights: trips.flights,
    refunds_credits: credits,
    ...Object.fromEntries(extra),
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
