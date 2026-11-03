import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NEAR_DAYS, SERPAPI_MONTHLY_CAP } from "@/lib/prices/hybrid";
import { pilotComparison } from "@/lib/prices/repo";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { PilotRunner } from "./pilot-runner";

export const metadata = { title: "Piloto de preços" };

export default function PilotoPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app/monitor"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Preços
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Piloto de preços</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Compara as fontes de preço da ponte aérea SDU ↔ CGH nas suas janelas de horário. Mais
          abaixo, o teste manual do Travelpayouts (mercados “br” e padrão), que só devolve preços
          vistos por usuários do Aviasales nas últimas 48 horas. Gratuito, usa o seu token.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <SerpComparison />
      </Suspense>
      <PilotRunner />
    </main>
  );
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

/** Piloto híbrido: Google Flights (SerpApi) × Travelpayouts nas mesmas datas próximas. */
async function SerpComparison() {
  const user = await getCurrentUser();
  const [cmp, hasKey] = await Promise.all([
    pilotComparison(user.id),
    listIntegrationsPublic(user.id).then((list) => list.some((i) => i.provider === "serpapi")),
  ]);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="font-semibold">Google Flights (SerpApi) × Travelpayouts</h2>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Nas próximas {NEAR_DAYS / 7} semanas, cada checagem também consulta o Google Flights pela
        SerpApi, com a sua chave, dentro do plano grátis. As semanas mais distantes continuam no
        Travelpayouts. A tabela compara as datas com voo dentro da sua janela de horário, nas mesmas
        datas, nos últimos 7 dias.
      </p>
      {!hasKey ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          Para ligar, crie uma conta grátis em serpapi.com e cole a chave em{" "}
          <Link className="underline underline-offset-4" href="/app/integracoes">
            Integrações → SerpApi
          </Link>
          .
        </p>
      ) : cmp.rows.length ? (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-zinc-600 dark:text-zinc-400">
            <tr>
              <th className="py-1 font-medium">Rota</th>
              <th className="py-1 font-medium">Datas</th>
              <th className="py-1 font-medium">Google Flights</th>
              <th className="py-1 font-medium">Travelpayouts</th>
            </tr>
          </thead>
          <tbody>
            {cmp.rows.map((r) => (
              <tr key={r.route} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-1">{r.route}</td>
                <td className="py-1">{r.nearDates}</td>
                <td className="py-1 font-medium">{pct(r.serpInWindow, r.nearDates)}</td>
                <td className="py-1">{pct(r.tpInWindow, r.nearDates)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          A primeira comparação aparece depois da próxima checagem diária (7h) ou de “Verificar
          agora” num monitor.
        </p>
      )}
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Buscas da SerpApi neste mês: {cmp.serpUsedThisMonth} de {SERPAPI_MONTHLY_CAP} (o plano
        grátis tem 250; o app para antes e nunca passa para o pago).
        {cmp.skipped.length ? ` Pulado nos últimos dias: ${cmp.skipped.join(", ")}.` : ""}
      </p>
    </section>
  );
}
