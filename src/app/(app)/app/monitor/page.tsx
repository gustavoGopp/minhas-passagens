import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { PROVIDER_INFO } from "@/lib/integrations/providers";
import { holidaysFor, listChecks, listMonitors } from "@/lib/prices/repo";
import { describeRule, expandRule } from "@/lib/prices/rule";
import { estimateQuota, FREQUENCY_LABEL } from "@/lib/prices/schedule";
import { trendOf } from "@/lib/prices/trend";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatBRL } from "@/lib/trips/summary";
import { utcToLocal } from "@/lib/trips/time";
import { PonteAereaForm } from "./ponte-aerea-form";

export const metadata = { title: "Preços" };

export default function MonitorPage() {
  return (
    <main className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Monitor de preços</h1>
        <Link
          href="/app/monitor/novo"
          className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-3 py-2 text-sm font-medium text-white dark:text-zinc-950"
        >
          Novo
        </Link>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Monitors />
      </Suspense>
    </main>
  );
}

const ARROW = { down: "↓", up: "↑", flat: "→" } as const;

async function Monitors() {
  const user = await getCurrentUser();
  const [monitors, integrations, profile] = await Promise.all([
    listMonitors(user.id),
    listIntegrationsPublic(user.id),
    getProfile(user.id),
  ]);
  const checks = await listChecks(
    user.id,
    monitors.map((m) => m.id),
  );
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const today = utcToLocal(new Date().toISOString(), tz).slice(0, 10);
  const holidays = monitors.some((m) => m.kind === "holiday")
    ? await holidaysFor(await createSupabaseServerClient(), user.id, profile, today)
    : [];
  const hasKey = new Set(integrations.map((i) => i.provider));
  const tp = PROVIDER_INFO.travelpayouts;

  return (
    <>
      {!hasKey.has("travelpayouts") ? (
        <section className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <h2 className="font-semibold">Configure a fonte de preços</h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            O monitor usa o {tp.name}, gratuito. {tp.help}
          </p>
          <p>
            <a
              href={tp.url}
              className="underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              Criar conta
            </a>{" "}
            ·{" "}
            <Link href="/app/integracoes" className="underline underline-offset-4">
              Colar o token em Integrações
            </Link>
          </p>
        </section>
      ) : null}

      {monitors.length ? (
        <ul className="flex flex-col gap-3">
          {monitors.map((m) => {
            const t = trendOf(checks.filter((c) => c.monitor_id === m.id));
            const targets = expandRule(m.rule, { today, horizonWeeks: m.horizon_weeks, holidays });
            const q = estimateQuota(targets.length, m.frequency, m.provider);
            const status = !m.active
              ? "Pausado"
              : !hasKey.has(m.provider)
                ? "Sem chave do provedor"
                : m.last_error
                  ? m.last_error
                  : null;
            return (
              <li key={m.id}>
                <Link
                  href={`/app/monitor/${m.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">
                      {m.name || `${m.origin} → ${m.destination}`}
                    </span>
                    <span className="text-lg font-semibold tabular-nums">
                      {t.last != null ? formatBRL(t.last) : "—"}
                      {t.direction ? (
                        <span
                          className="ml-1 text-sm text-zinc-600 dark:text-zinc-400"
                          aria-label={
                            t.direction === "down"
                              ? "caiu"
                              : t.direction === "up"
                                ? "subiu"
                                : "estável"
                          }
                        >
                          {ARROW[t.direction]}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {m.origin} → {m.destination} · {describeRule(m.rule)}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    Alvo {formatBRL(m.target_cents)} · {FREQUENCY_LABEL[m.frequency]} ·{" "}
                    {targets.length} datas · ≈ {q.perMonth} req/mês
                  </span>
                  {status ? (
                    <span className="text-xs text-amber-700 dark:text-amber-300">{status}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum monitor ainda.</p>
      )}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Atalho: ponte aérea semanal</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Cria dois monitores: SDU → CGH (segunda até 8h ou domingo a partir de 12h) e CGH → SDU
          (quinta a partir de 18h ou sexta até 13h), Azul, Gol e LATAM, só voos diretos, 8 semanas,
          checagem diária às 7h.
        </p>
        <PonteAereaForm />
      </section>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        <Link href="/app/monitor/piloto" className="underline underline-offset-4">
          Piloto de cobertura do Travelpayouts
        </Link>
      </p>
    </>
  );
}
