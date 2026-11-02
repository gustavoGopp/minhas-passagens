import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCredits } from "@/lib/trips/credits-repo";
import {
  averageByRoute,
  spendByAirline,
  spendByChannel,
  spendByMonth,
  spendByTag,
  type SpendLine,
} from "@/lib/trips/reports";
import { listTrips } from "@/lib/trips/repo";
import { formatBRL } from "@/lib/trips/summary";

export const metadata = { title: "Gastos" };

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;

export default function GastosPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Gastos</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Reports />
      </Suspense>
    </main>
  );
}

function Table({ title, lines, note }: { title: string; lines: SpendLine[]; note?: string }) {
  if (!lines.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">{title}</h2>
      <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {lines.map((l) => (
          <li key={l.label} className="flex items-center justify-between gap-3 px-4 py-2">
            <span>
              {l.label} <span className="text-xs text-zinc-500">({l.count})</span>
            </span>
            <span className="text-right tabular-nums">
              {formatBRL(l.cents)}
              {l.miles ? (
                <span className="block text-xs text-zinc-500">
                  {l.miles.toLocaleString("pt-BR")} milhas
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      {note ? <p className="text-xs text-zinc-500">{note}</p> : null}
    </section>
  );
}

async function Reports() {
  const user = await getCurrentUser();
  const [{ bookings, flights }, credits] = await Promise.all([
    listTrips(user.id),
    listCredits(user.id),
  ]);
  if (!bookings.length)
    return <p className="text-sm text-zinc-500">Cadastre passagens para ver os gastos.</p>;
  const months = spendByMonth(bookings, credits).slice(0, 12);
  const routes = averageByRoute(bookings, flights);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
          Por mês da compra
        </h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 text-left font-normal">Mês</th>
              <th className="py-1 text-right font-normal">Pago</th>
              <th className="py-1 text-right font-normal">Reembolsos</th>
              <th className="py-1 text-right font-normal">Líquido</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {months.map((m) => (
              <tr key={m.month} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="py-2">{monthLabel(m.month)}</td>
                <td className="py-2 text-right">
                  {formatBRL(m.cents)}
                  {m.miles ? (
                    <span className="block text-xs text-zinc-500">
                      {m.miles.toLocaleString("pt-BR")} mi
                    </span>
                  ) : null}
                </td>
                <td className="py-2 text-right">
                  {m.refundsCents ? `− ${formatBRL(m.refundsCents)}` : "—"}
                </td>
                <td className="py-2 text-right font-medium">{formatBRL(m.netCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-zinc-500">
          Inclui passagens canceladas (o dinheiro saiu); reembolsos entram no mês em que foram
          recebidos.
        </p>
      </section>
      <Table title="Por companhia" lines={spendByAirline(bookings)} note="Sem canceladas." />
      <Table title="Por canal de compra" lines={spendByChannel(bookings)} />
      <Table title="Pessoal x trabalho" lines={spendByTag(bookings)} />
      {routes.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Preço médio por trecho
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
            {routes.map((r) => (
              <li key={r.route} className="flex justify-between px-4 py-2">
                <span>
                  {r.route} <span className="text-xs text-zinc-500">({r.legs})</span>
                </span>
                <span className="tabular-nums">{formatBRL(r.avgCents)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500">
            Valor da reserva dividido igualmente entre os trechos; emissões com milhas ficam de
            fora.
          </p>
        </section>
      ) : null}
    </>
  );
}
