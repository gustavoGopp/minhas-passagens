import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceChart } from "@/components/price-chart";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatFlightDate, SIGNAL_LABEL, type Signal } from "@/lib/prices/alerts";
import { normalizeAirline } from "@/lib/prices/filter";
import { getMonitor, listChecks, listObservations } from "@/lib/prices/repo";
import { describeRule } from "@/lib/prices/rule";
import { estimateQuota, FREQUENCY_LABEL, PROVIDER_QUOTA } from "@/lib/prices/schedule";
import { chartSeries, trendOf } from "@/lib/prices/trend";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { airlineName } from "@/lib/trips/airlines";
import { formatBRL } from "@/lib/trips/summary";
import { formatInZone } from "@/lib/trips/time";
import { deleteMonitorAction, toggleMonitorAction } from "../actions";
import { CheckNowButton } from "./check-now-button";

export const metadata = { title: "Monitor" };

export default function MonitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/app/monitor" className="text-sm text-zinc-500 underline underline-offset-4">
        ← Preços
      </Link>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

const h2 = "text-sm font-semibold tracking-wide text-zinc-500 uppercase";

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [m, profile] = await Promise.all([getMonitor(user.id, id), getProfile(user.id)]);
  if (!m) notFound();
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const checks = await listChecks(user.id, [id], 90);
  const lastOk = checks.find((c) => !c.error);
  const supabase = await createSupabaseServerClient();
  const [obs, alertsRes] = await Promise.all([
    lastOk ? listObservations(user.id, id, lastOk.id) : Promise.resolve([]),
    supabase
      .from("price_alerts")
      .select("id, flight_date, departs_local, price_cents, signals, created_at, sent_at")
      .eq("monitor_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const t = trendOf(checks);
  const bestByDate = new Map<string, (typeof obs)[number]>();
  for (const o of obs) if (!bestByDate.has(o.flight_date)) bestByDate.set(o.flight_date, o);
  const q = estimateQuota(lastOk?.target_dates ?? 0, m.frequency, m.provider);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {m.name || `${m.origin} → ${m.destination}`}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {m.origin} → {m.destination} · {describeRule(m.rule)}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Alvo {formatBRL(m.target_cents)}
          {m.margin_cents
            ? ` (± ${formatBRL(m.margin_cents)})`
            : m.margin_pct
              ? ` (± ${m.margin_pct}%)`
              : ""}{" "}
          · {m.airlines.length ? m.airlines.map(airlineName).join(", ") : "todas as companhias"} ·{" "}
          {m.allow_connections ? "aceita conexão" : "só direto"}
          {m.max_duration_min ? ` · até ${m.max_duration_min} min` : ""}
        </p>
        <p className="text-xs text-zinc-500">
          {FREQUENCY_LABEL[m.frequency]} · {m.horizon_weeks} semanas ·{" "}
          {m.active ? "ativo" : "pausado"}
          {m.next_check_at && m.active ? ` · próxima ${formatInZone(m.next_check_at, tz)}` : ""}
        </p>
        {m.last_error ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">{m.last_error}</p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-start gap-2">
        <CheckNowButton id={id} />
        <Link
          href={`/app/monitor/${id}/editar`}
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
        >
          Editar
        </Link>
        <form action={toggleMonitorAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={String(!m.active)} />
          <button className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
            {m.active ? "Pausar" : "Retomar"}
          </button>
        </form>
        <form action={deleteMonitorAction}>
          <input type="hidden" name="id" value={id} />
          <button className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300">
            Apagar
          </button>
        </form>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Menor preço por checagem</h2>
        {t.last != null ? (
          <p className="text-sm">
            Agora <strong className="tabular-nums">{formatBRL(t.last)}</strong>
            {t.prev != null ? ` · antes ${formatBRL(t.prev)}` : ""}
          </p>
        ) : null}
        <PriceChart points={chartSeries(checks)} targetCents={m.target_cents} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Preços da última checagem</h2>
        {lastOk ? (
          <p className="text-xs text-zinc-500">
            {formatInZone(lastOk.checked_at, tz)} · {lastOk.dates_matched} de {lastOk.target_dates}{" "}
            datas com preço nas janelas ({lastOk.dates_with_data} com algum dado do provedor) ·{" "}
            {lastOk.requests} requisições
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Ainda não houve checagem.</p>
        )}
        {bestByDate.size ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1 font-medium">Voo</th>
                <th className="py-1 font-medium">Companhia</th>
                <th className="py-1 text-right font-medium">Preço</th>
              </tr>
            </thead>
            <tbody>
              {[...bestByDate.values()].map((o) => (
                <tr
                  key={o.flight_date}
                  className={`border-t border-zinc-100 dark:border-zinc-900 ${o.near_holiday ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}
                >
                  <td className="py-2">
                    {formatFlightDate(o.flight_date, o.departs_local.slice(11, 16))}
                    {o.near_holiday ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                        feriado perto
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {airlineName(normalizeAirline(o.airline))}{" "}
                    {o.flight_number?.split(" ")[1] ?? ""}
                    {o.transfers ? ` · ${o.transfers} conexão` : ""}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${o.price_cents <= m.target_cents ? "font-semibold" : ""}`}
                  >
                    {formatBRL(o.price_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p className="text-xs text-zinc-500">
          Preços com “feriado perto” (destacados) tendem a subir e ficam fora da média de 30 dias. ≈{" "}
          {q.perMonth} requisições por mês · {PROVIDER_QUOTA[m.provider].note}.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={h2}>Avisos</h2>
        {alertsRes.data?.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {alertsRes.data.map((a) => (
              <li key={a.id as string} className="flex justify-between gap-3">
                <span>
                  {formatFlightDate(a.flight_date as string, String(a.departs_local).slice(11, 16))}{" "}
                  · {(a.signals as Signal[]).map((s) => SIGNAL_LABEL[s]).join(", ")}
                </span>
                <span className="text-zinc-500 tabular-nums">
                  {formatBRL(Number(a.price_cents))} · {a.sent_at ? "enviado" : "na fila"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Nenhum aviso ainda.</p>
        )}
      </section>
    </>
  );
}
