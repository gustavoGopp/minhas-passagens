import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { PRICE_PROVIDERS, type PriceProviderId } from "@/lib/prices/types";
import { MonitorForm } from "../monitor-form";

export const metadata = { title: "Novo monitor" };

export default function NovoMonitorPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app/monitor"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Preços
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Novo monitor</h1>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Form />
      </Suspense>
    </main>
  );
}

async function Form() {
  const user = await getCurrentUser();
  const providers = (await listIntegrationsPublic(user.id))
    .map((i) => i.provider)
    .filter((p): p is PriceProviderId => (PRICE_PROVIDERS as readonly string[]).includes(p));
  return <MonitorForm configuredProviders={providers} />;
}
