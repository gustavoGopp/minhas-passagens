import { formatBRL } from "@/lib/trips/summary";

/**
 * Histórico do menor preço por checagem (uma série; o título da seção nomeia o
 * gráfico). Linha do alvo tracejada e rotulada. Pontos cujo menor preço caiu
 * perto de feriado ficam destacados (âmbar, maiores) e entram numa legenda.
 * Cada ponto tem dica com data e valor; a tabela da página serve como visão em texto.
 */
export function PriceChart({
  points,
  targetCents,
}: {
  points: { at: string; cents: number; nearHoliday?: boolean }[];
  targetCents: number;
}) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        O gráfico aparece depois de duas checagens com preço.
      </p>
    );
  }
  const W = 600;
  const H = 200;
  const pad = { l: 64, r: 12, t: 12, b: 24 };
  const values = [...points.map((p) => p.cents), targetCents];
  const lo = Math.min(...values) * 0.95;
  const hi = Math.max(...values) * 1.05;
  const t0 = Date.parse(points[0].at);
  const t1 = Date.parse(points[points.length - 1].at);
  const x = (at: string) =>
    pad.l + ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * (W - pad.l - pad.r);
  const y = (c: number) => pad.t + (1 - (c - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v / 100) * 100);
  const d = points
    .map((p, i) => `${i ? "L" : "M"}${x(p.at).toFixed(1)},${y(p.cents).toFixed(1)}`)
    .join(" ");
  const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const anyHoliday = points.some((p) => p.nearHoliday);

  return (
    <figure className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Menor preço por checagem, de ${formatBRL(points[0].cents)} a ${formatBRL(points[points.length - 1].cents)}`}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              className="stroke-zinc-200 dark:stroke-zinc-800"
              strokeWidth={1}
            />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">
              {formatBRL(v).replace(/,00$/, "")}
            </text>
          </g>
        ))}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={y(targetCents)}
          y2={y(targetCents)}
          className="stroke-zinc-500"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <text
          x={W - pad.r}
          y={y(targetCents) - 5}
          textAnchor="end"
          className="fill-zinc-600 text-[11px] dark:fill-zinc-400"
        >
          alvo {formatBRL(targetCents)}
        </text>
        <path
          d={d}
          fill="none"
          className="stroke-zinc-900 dark:stroke-zinc-100"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <g key={p.at}>
            <circle
              cx={x(p.at)}
              cy={y(p.cents)}
              r={p.nearHoliday ? 5.5 : 4}
              className={
                p.nearHoliday
                  ? "fill-amber-500 stroke-white dark:fill-amber-400 dark:stroke-zinc-950"
                  : "fill-zinc-900 stroke-white dark:fill-zinc-100 dark:stroke-zinc-950"
              }
              strokeWidth={2}
            />
            {/* Alvo de toque maior que o ponto, com dica nativa. */}
            <circle cx={x(p.at)} cy={y(p.cents)} r={12} fill="transparent">
              <title>{`${fmtDay(p.at)}: ${formatBRL(p.cents)}${p.nearHoliday ? " · perto de feriado" : ""}`}</title>
            </circle>
          </g>
        ))}
        <text x={pad.l} y={H - 6} className="fill-zinc-500 text-[11px]">
          {fmtDay(points[0].at)}
        </text>
        <text x={W - pad.r} y={H - 6} textAnchor="end" className="fill-zinc-500 text-[11px]">
          {fmtDay(points[points.length - 1].at)}
        </text>
      </svg>
      {anyHoliday ? (
        <figcaption className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
          <svg width="12" height="12" aria-hidden="true">
            <circle cx="6" cy="6" r="5" className="fill-amber-500 dark:fill-amber-400" />
          </svg>
          Menor preço perto de feriado (fora da média de 30 dias)
        </figcaption>
      ) : null}
    </figure>
  );
}
