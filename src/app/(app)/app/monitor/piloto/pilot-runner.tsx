"use client";
import { useActionState } from "react";
import { formatBRL } from "@/lib/trips/summary";
import { runPilotAction, type PilotState } from "../actions";

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "—");

export function PilotRunner() {
  const [state, action, pending] = useActionState<PilotState, FormData>(runPilotAction, {});
  const r = state.report;
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Semanas
          <input
            name="weeks"
            type="number"
            min={1}
            max={12}
            defaultValue={8}
            className="w-24 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <button
          disabled={pending}
          className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
        >
          {pending ? "Consultando…" : "Rodar piloto"}
        </button>
      </form>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {r ? (
        <>
          <p
            className={`rounded-xl border p-3 text-sm ${
              r.ok
                ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/40"
                : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
            }`}
          >
            {r.ok ? "✓ Cobertura suficiente" : "⚠ Cobertura insuficiente"}:{" "}
            {Math.round(r.coverage * 100)}% das datas com preço no mercado “{r.bestMarket}” (
            {Math.round(r.coverageInWindow * 100)}% dentro das janelas de horário).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-600 dark:text-zinc-400">
                <th className="py-1 font-medium">Trecho</th>
                <th className="py-1 font-medium">Mercado</th>
                <th className="py-1 text-right font-medium">Com preço</th>
                <th className="py-1 text-right font-medium">Na janela</th>
                <th className="py-1 text-right font-medium">Menor</th>
              </tr>
            </thead>
            <tbody>
              {r.legs.map((l) => (
                <tr
                  key={`${l.route}-${l.market}`}
                  className="border-t border-zinc-100 dark:border-zinc-900"
                >
                  <td className="py-2">{l.route}</td>
                  <td className="py-2">{l.market}</td>
                  <td className="py-2 text-right tabular-nums">
                    {l.withData}/{l.targets} ({pct(l.withData, l.targets)})
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {l.inWindow}/{l.targets} ({pct(l.inWindow, l.targets)})
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {l.minPriceCents != null ? formatBRL(l.minPriceCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {r.legs
              .map(
                (l) =>
                  `${l.route} ${l.market}: companhias ${l.airlines.join(", ") || "nenhuma"}${
                    l.otherAirportOnly ? `, ${l.otherAirportOnly} datas só em outro aeroporto` : ""
                  }${l.failed ? `, ${l.failed} falhas` : ""}`,
              )
              .join(" · ")}
          </p>
        </>
      ) : null}
    </div>
  );
}
