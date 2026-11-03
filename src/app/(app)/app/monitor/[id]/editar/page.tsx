import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { getMonitor } from "@/lib/prices/repo";
import { PRICE_PROVIDERS, type PriceProviderId } from "@/lib/prices/types";
import { MonitorForm } from "../../monitor-form";

export const metadata = { title: "Editar monitor" };

export default function EditarMonitorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Edit params={params} />
      </Suspense>
    </main>
  );
}

async function Edit({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [m, integrations] = await Promise.all([
    getMonitor(user.id, id),
    listIntegrationsPublic(user.id),
  ]);
  if (!m) notFound();
  const providers = integrations
    .map((i) => i.provider)
    .filter((p): p is PriceProviderId => (PRICE_PROVIDERS as readonly string[]).includes(p));
  return (
    <>
      <Link
        href={`/app/monitor/${id}`}
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Monitor
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Editar monitor</h1>
      <MonitorForm
        id={id}
        configuredProviders={providers}
        initial={{
          name: m.name ?? "",
          kind: m.kind,
          origin: m.origin,
          destination: m.destination,
          rule: m.rule,
          horizon_weeks: m.horizon_weeks,
          target_cents: m.target_cents,
          margin_cents: m.margin_cents,
          margin_pct: m.margin_pct,
          airlines: m.airlines,
          allow_connections: m.allow_connections,
          max_duration_min: m.max_duration_min,
          frequency: m.frequency,
          provider: m.provider,
          active: m.active,
        }}
      />
    </>
  );
}
