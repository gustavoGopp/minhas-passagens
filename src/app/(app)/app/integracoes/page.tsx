import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic, type Provider } from "@/lib/integrations/repo";
import { PROVIDER_INFO } from "@/lib/integrations/providers";
import { IntegrationCard } from "./integration-card";

export const metadata = { title: "Integrações" };

export default function IntegracoesPage() {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Cada pessoa usa as próprias chaves. Elas ficam cifradas no banco, nunca chegam ao
          navegador e o custo de uso é cobrado só na sua conta do provedor.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <IntegrationsList />
      </Suspense>
    </main>
  );
}

async function IntegrationsList() {
  const user = await getCurrentUser();
  const current = await listIntegrationsPublic(user.id);
  const byProvider = new Map(current.map((c) => [c.provider, c]));
  const order: Provider[] = ["anthropic", "travelpayouts", "duffel", "serpapi"];
  return (
    <div className="flex flex-col gap-4">
      {order.map((p) => (
        <IntegrationCard
          key={p}
          provider={p}
          info={PROVIDER_INFO[p]}
          current={byProvider.get(p) ?? null}
        />
      ))}
    </div>
  );
}
