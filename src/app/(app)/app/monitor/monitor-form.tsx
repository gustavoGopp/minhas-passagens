"use client";
import { useActionState, useState } from "react";
import { PONTE_AEREA, WEEKDAYS_PT, expandRule } from "@/lib/prices/rule";
import { estimateQuota, FREQUENCY_LABEL, PROVIDER_QUOTA } from "@/lib/prices/schedule";
import type { MonitorInput } from "@/lib/prices/schema";
import type {
  DateRange,
  Frequency,
  MonitorKind,
  PriceProviderId,
  WeeklySlot,
} from "@/lib/prices/types";
import { saveMonitorAction, type MonitorFormState } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "flex flex-col gap-1 text-sm font-medium";
const small = "rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700";

const AIRLINE_OPTIONS = [
  { code: "AD", name: "Azul" },
  { code: "G3", name: "Gol" },
  { code: "LA", name: "LATAM" },
];
const PROVIDER_NAMES: Record<PriceProviderId, string> = {
  travelpayouts: "Travelpayouts (grátis)",
  serpapi: "SerpApi (sua cota)",
  duffel: "Duffel (pago por busca)",
};

const reais = (cents: number | null | undefined) =>
  cents == null ? "" : (cents / 100).toFixed(2).replace(".", ",").replace(/,00$/, "");
const toCents = (text: string): number | null => {
  const clean = text.replace(/[^\d,.]/g, "");
  if (!clean) return null;
  const n = Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export function MonitorForm({
  id,
  initial,
  configuredProviders,
}: {
  id?: string;
  initial?: MonitorInput;
  configuredProviders: PriceProviderId[];
}) {
  const [state, action, pending] = useActionState<MonitorFormState, FormData>(
    saveMonitorAction,
    {},
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<MonitorKind>(initial?.kind ?? "weekly");
  const [origin, setOrigin] = useState(initial?.origin ?? "SDU");
  const [destination, setDestination] = useState(initial?.destination ?? "CGH");
  const [slots, setSlots] = useState<WeeklySlot[]>(
    initial?.rule.kind === "weekly" ? initial.rule.slots : [...PONTE_AEREA.rioSp.rule.slots],
  );
  const [ranges, setRanges] = useState<DateRange[]>(
    initial?.rule.kind === "dates"
      ? initial.rule.ranges
      : [{ start: "", end: "", from: "00:00", to: "23:59" }],
  );
  const [leg, setLeg] = useState<"outbound" | "return">(
    initial?.rule.kind === "holiday" ? initial.rule.leg : "outbound",
  );
  const [hWindow, setHWindow] = useState(
    initial?.rule.kind === "holiday" ? initial.rule.window : { from: "17:00", to: "23:59" },
  );
  const [horizon, setHorizon] = useState(initial?.horizon_weeks ?? 8);
  const [target, setTarget] = useState(reais(initial?.target_cents ?? 40000));
  const [marginMode, setMarginMode] = useState<"brl" | "pct">(
    initial?.margin_pct != null ? "pct" : "brl",
  );
  const [margin, setMargin] = useState(
    initial?.margin_pct != null ? String(initial.margin_pct) : reais(initial?.margin_cents ?? 5000),
  );
  const [airlines, setAirlines] = useState<string[]>(initial?.airlines ?? ["AD", "G3", "LA"]);
  const [allowConn, setAllowConn] = useState(initial?.allow_connections ?? false);
  const [maxDur, setMaxDur] = useState(
    initial?.max_duration_min ? String(initial.max_duration_min) : "",
  );
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? "daily");
  const [provider, setProvider] = useState<PriceProviderId>(initial?.provider ?? "travelpayouts");
  const [active, setActive] = useState(initial?.active ?? true);

  const rule =
    kind === "weekly"
      ? { kind, slots }
      : kind === "dates"
        ? { kind, ranges }
        : { kind, leg, window: hWindow };

  const payload: MonitorInput = {
    name,
    kind,
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    rule: rule as MonitorInput["rule"],
    horizon_weeks: horizon,
    target_cents: toCents(target) ?? 0,
    margin_cents: marginMode === "brl" ? toCents(margin) : null,
    margin_pct: marginMode === "pct" && margin ? Number(margin.replace(",", ".")) : null,
    airlines,
    allow_connections: allowConn,
    max_duration_min: maxDur ? Number(maxDur) : null,
    frequency,
    provider,
    active,
  };

  const quota = (() => {
    if (kind === "holiday") return null;
    const today = new Date().toISOString().slice(0, 10);
    const n = expandRule(payload.rule, { today, horizonWeeks: horizon }).length;
    return { n, ...estimateQuota(n, frequency, provider) };
  })();

  const fillPonte = (dir: "rioSp" | "spRio") => {
    const p = PONTE_AEREA[dir];
    setKind("weekly");
    setOrigin(p.origin);
    setDestination(p.destination);
    setSlots([...p.rule.slots]);
    setName(dir === "rioSp" ? "Ponte aérea RJ → SP" : "Ponte aérea SP → RJ");
    setAllowConn(false);
    setAirlines(["AD", "G3", "LA"]);
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={id ?? ""} />
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {!id ? (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-zinc-600 dark:text-zinc-400">Preencher com a ponte aérea:</span>
          <button type="button" className={small} onClick={() => fillPonte("rioSp")}>
            SDU → CGH
          </button>
          <button type="button" className={small} onClick={() => fillPonte("spRio")}>
            CGH → SDU
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <label className={`${label} col-span-2`}>
          Nome (opcional)
          <input
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </label>
        <label className={label}>
          Origem
          <input
            className={`${input} uppercase`}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            maxLength={3}
            required
          />
        </label>
        <label className={label}>
          Destino
          <input
            className={`${input} uppercase`}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            maxLength={3}
            required
          />
        </label>
        <label className={`${label} col-span-2`}>
          Tipo
          <select
            className={input}
            value={kind}
            onChange={(e) => setKind(e.target.value as MonitorKind)}
          >
            <option value="weekly">Recorrente semanal</option>
            <option value="dates">Datas fixas ou janela de datas</option>
            <option value="holiday">Feriado prolongado</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <legend className="px-1 text-sm font-medium">Quando (horário local da origem)</legend>
        {kind === "weekly" ? (
          <>
            {slots.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
                <select
                  className={input}
                  value={s.weekday}
                  aria-label="Dia da semana"
                  onChange={(e) =>
                    setSlots(
                      slots.map((x, j) =>
                        j === i ? { ...x, weekday: Number(e.target.value) } : x,
                      ),
                    )
                  }
                >
                  {WEEKDAYS_PT.map((d, wd) => (
                    <option key={d} value={wd}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  className={input}
                  value={s.from}
                  aria-label="De"
                  onChange={(e) =>
                    setSlots(slots.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))
                  }
                />
                <input
                  type="time"
                  className={input}
                  value={s.to}
                  aria-label="Até"
                  onChange={(e) =>
                    setSlots(slots.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))
                  }
                />
                <button
                  type="button"
                  className={small}
                  aria-label="Remover"
                  onClick={() => setSlots(slots.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className={`${small} self-start`}
              onClick={() => setSlots([...slots, { weekday: 1, from: "00:00", to: "23:59" }])}
            >
              + dia
            </button>
          </>
        ) : kind === "dates" ? (
          <>
            {ranges.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
                {(["start", "end"] as const).map((k) => (
                  <input
                    key={k}
                    type="date"
                    className={input}
                    value={r[k]}
                    aria-label={k === "start" ? "De" : "Até"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRanges(
                        ranges.map((x, j) =>
                          j === i
                            ? { ...x, [k]: v, ...(k === "start" && !x.end ? { end: v } : {}) }
                            : x,
                        ),
                      );
                    }}
                    required
                  />
                ))}
                {(["from", "to"] as const).map((k) => (
                  <input
                    key={k}
                    type="time"
                    className={input}
                    value={r[k]}
                    aria-label={k === "from" ? "A partir de" : "Até"}
                    onChange={(e) =>
                      setRanges(ranges.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))
                    }
                  />
                ))}
                <button
                  type="button"
                  className={small}
                  aria-label="Remover"
                  onClick={() => setRanges(ranges.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className={`${small} self-start`}
              onClick={() =>
                setRanges([...ranges, { start: "", end: "", from: "00:00", to: "23:59" }])
              }
            >
              + data
            </button>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <select
              className={input}
              value={leg}
              onChange={(e) => setLeg(e.target.value as "outbound" | "return")}
            >
              <option value="outbound">Ida (véspera e 1º dia)</option>
              <option value="return">Volta (último dia e seguinte)</option>
            </select>
            <input
              type="time"
              className={input}
              value={hWindow.from}
              aria-label="A partir de"
              onChange={(e) => setHWindow({ ...hWindow, from: e.target.value })}
            />
            <input
              type="time"
              className={input}
              value={hWindow.to}
              aria-label="Até"
              onChange={(e) => setHWindow({ ...hWindow, to: e.target.value })}
            />
          </div>
        )}
        <label className={label}>
          Horizonte (semanas à frente)
          <input
            type="number"
            min={1}
            max={52}
            className={input}
            value={horizon}
            onChange={(e) => setHorizon(Number(e.target.value) || 1)}
          />
        </label>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Preço-alvo (R$)
          <input
            className={input}
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            required
          />
        </label>
        <label className={label}>
          Margem
          <div className="flex gap-2">
            <input
              className={input}
              inputMode="decimal"
              value={margin}
              onChange={(e) => setMargin(e.target.value)}
            />
            <select
              className={`${input} w-20`}
              value={marginMode}
              aria-label="Unidade da margem"
              onChange={(e) => setMarginMode(e.target.value as "brl" | "pct")}
            >
              <option value="brl">R$</option>
              <option value="pct">%</option>
            </select>
          </div>
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Companhias (nenhuma marcada = todas)</legend>
        <div className="flex gap-4 text-sm">
          {AIRLINE_OPTIONS.map((a) => (
            <label key={a.code} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={airlines.includes(a.code)}
                onChange={(e) =>
                  setAirlines(
                    e.target.checked ? [...airlines, a.code] : airlines.filter((x) => x !== a.code),
                  )
                }
              />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowConn}
            onChange={(e) => setAllowConn(e.target.checked)}
          />
          Aceita conexão
        </label>
        <label className={label}>
          Duração máxima (min)
          <input
            type="number"
            min={30}
            className={input}
            value={maxDur}
            onChange={(e) => setMaxDur(e.target.value)}
            placeholder="sem limite"
          />
        </label>
        <label className={label}>
          Frequência
          <select
            className={input}
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Fonte
          <select
            className={input}
            value={provider}
            onChange={(e) => setProvider(e.target.value as PriceProviderId)}
          >
            {(Object.keys(PROVIDER_NAMES) as PriceProviderId[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_NAMES[p]}
                {configuredProviders.includes(p) ? "" : " — sem chave"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        {quota
          ? `${quota.n} datas no horizonte · ${quota.perCheck} requisições por checagem · ≈ ${quota.perMonth} por mês. `
          : "As datas dependem dos feriados do seu calendário. "}
        {PROVIDER_QUOTA[provider].note}
        {quota?.shareOfFree != null && quota.shareOfFree > 1
          ? ` · Passa da cota grátis (${Math.round(quota.shareOfFree * 100)}%): reduza a frequência ou o horizonte.`
          : ""}
        {quota?.usdPerMonth ? ` · ≈ US$ ${quota.usdPerMonth.toFixed(2)}/mês na sua conta.` : ""}
      </p>
      {!configuredProviders.includes(provider) ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Sem chave deste provedor: o monitor fica salvo, mas só checa depois de configurar em Mais
          → Integrações.
        </p>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Ativo
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
      >
        {pending ? "Salvando…" : id ? "Salvar" : "Criar monitor"}
      </button>
    </form>
  );
}
