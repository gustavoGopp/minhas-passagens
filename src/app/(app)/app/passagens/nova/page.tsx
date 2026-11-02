import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { NewBookingFlow } from "./new-booking-flow";

export const metadata = { title: "Nova passagem" };

export default function NovaPassagemPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Nova passagem</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Flow />
      </Suspense>
    </main>
  );
}

async function Flow() {
  const user = await getCurrentUser();
  const integrations = await listIntegrationsPublic(user.id);
  const hasKey = integrations.some((i) => i.provider === "anthropic");
  return <NewBookingFlow hasKey={hasKey} />;
}
