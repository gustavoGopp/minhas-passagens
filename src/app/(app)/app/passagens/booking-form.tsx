"use client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { listAirports } from "@/lib/airports";
import { AIRLINES, CHANNELS } from "@/lib/trips/airlines";
import { emptyLeg, type BookingDraft, type LegDraft } from "@/lib/trips/draft";
import { saveBookingAction, type SaveState } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "flex flex-col gap-1 text-sm font-medium";

export function BookingForm({
  initial,
  onSaved,
}: {
  initial: BookingDraft;
  onSaved?: (id: string) => void;
}) {
  const [d, setD] = useState<BookingDraft>(initial);
  const [state, action, pending] = useActionState<SaveState, FormData>(saveBookingAction, {});
  const router = useRouter();

  // Dispara uma única vez por salvamento (onSaved muda a cada render do pai).
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!state.savedId || handled.current === state.savedId) return;
    handled.current = state.savedId;
    if (onSaved) onSaved(state.savedId);
    else router.push(`/app/passagens/${state.savedId}`);
  }, [state.savedId, onSaved, router]);

  const set = <K extends keyof BookingDraft>(k: K, v: BookingDraft[K]) =>
    setD((p) => ({ ...p, [k]: v }));
  const setLeg = (i: number, patch: Partial<LegDraft>) =>
    setD((p) => ({ ...p, legs: p.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  const isMiles = d.channel === "miles";

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="payload" value={JSON.stringify(d)} />
      <datalist id="aeroportos">
        {listAirports().map((a) => (
          <option key={a.iata} value={a.iata}>
            {a.city} – {a.name}
          </option>
        ))}
      </datalist>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Localizador
          <input
            className={input}
            value={d.locator}
            onChange={(e) => set("locator", e.target.value.toUpperCase())}
          />
        </label>
        <label className={label}>
          Companhia
          <select
            className={input}
            value={d.airline}
            onChange={(e) => {
              const v = e.target.value;
              setD((p) => ({
                ...p,
                airline: v,
                legs: p.legs.map((l) => ({
                  ...l,
                  airline: l.airline === p.airline ? v : l.airline,
                })),
              }));
            }}
          >
            {AIRLINES.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Onde comprou
          <select
            className={input}
            value={d.channel}
            onChange={(e) => set("channel", e.target.value as BookingDraft["channel"])}
          >
            {CHANNELS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Vendedor
          <input
            className={input}
            placeholder="Ex.: 123milhas, Smiles"
            value={d.seller}
            onChange={(e) => set("seller", e.target.value)}
          />
        </label>
        {isMiles ? (
          <>
            <label className={label}>
              Milhas
              <input
                className={input}
                inputMode="numeric"
                value={d.miles}
                onChange={(e) => set("miles", e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <label className={label}>
              Taxas (R$)
              <input
                className={input}
                inputMode="decimal"
                value={d.taxes}
                onChange={(e) => set("taxes", e.target.value)}
              />
            </label>
          </>
        ) : (
          <label className={label}>
            Valor pago (R$)
            <input
              className={input}
              inputMode="decimal"
              placeholder="0,00"
              value={d.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </label>
        )}
        <label className={label}>
          Data da compra
          <input
            className={input}
            type="date"
            value={d.purchased_on}
            onChange={(e) => set("purchased_on", e.target.value)}
          />
        </label>
        <label className={label}>
          Etiqueta
          <select
            className={input}
            value={d.tag}
            onChange={(e) => set("tag", e.target.value as BookingDraft["tag"])}
          >
            <option value="personal">Pessoal</option>
            <option value="work">Trabalho</option>
          </select>
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">Trechos</legend>
        {d.legs.map((l, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className={label}>
                De
                <input
                  className={input}
                  list="aeroportos"
                  placeholder="SDU"
                  value={l.origin}
                  onChange={(e) => setLeg(i, { origin: e.target.value.toUpperCase().slice(0, 3) })}
                />
              </label>
              <label className={label}>
                Para
                <input
                  className={input}
                  list="aeroportos"
                  placeholder="CGH"
                  value={l.destination}
                  onChange={(e) =>
                    setLeg(i, { destination: e.target.value.toUpperCase().slice(0, 3) })
                  }
                />
              </label>
              <label className={label}>
                Partida (hora local)
                <input
                  className={input}
                  type="datetime-local"
                  value={l.departure_local}
                  onChange={(e) => setLeg(i, { departure_local: e.target.value })}
                />
              </label>
              <label className={label}>
                Chegada (hora local)
                <input
                  className={input}
                  type="datetime-local"
                  value={l.arrival_local}
                  onChange={(e) => setLeg(i, { arrival_local: e.target.value })}
                />
              </label>
              <label className={label}>
                Voo
                <input
                  className={input}
                  placeholder="AD 4512"
                  value={l.flight_number}
                  onChange={(e) => setLeg(i, { flight_number: e.target.value.toUpperCase() })}
                />
              </label>
              <label className={label}>
                Companhia do trecho
                <select
                  className={input}
                  value={l.airline}
                  onChange={(e) => setLeg(i, { airline: e.target.value })}
                >
                  {AIRLINES.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {d.legs.length > 1 ? (
              <button
                type="button"
                className="self-start text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                onClick={() => setD((p) => ({ ...p, legs: p.legs.filter((_, j) => j !== i) }))}
              >
                Remover trecho
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
          onClick={() =>
            setD((p) => {
              const last = p.legs[p.legs.length - 1];
              // Atalho para a volta: inverte origem e destino do último trecho.
              return {
                ...p,
                legs: [
                  ...p.legs,
                  {
                    ...emptyLeg(last?.airline ?? p.airline),
                    origin: last?.destination ?? "",
                    destination: last?.origin ?? "",
                  },
                ],
              };
            })
          }
        >
          + Adicionar trecho (volta ou conexão)
        </button>
      </fieldset>

      <label className={label}>
        Observações
        <textarea
          className={input}
          rows={2}
          value={d.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : d.id ? "Salvar alterações" : "Salvar passagem"}
      </button>
    </form>
  );
}
