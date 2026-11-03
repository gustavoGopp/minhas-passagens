import Link from "next/link";
import { monitorLongWeekendAction } from "@/app/(app)/app/monitor/actions";
import type { LongWeekendItem } from "@/lib/holidays/context";
import { bridgeSuggestion, describeLongWeekend, longWeekendDays } from "@/lib/prices/rule";

/** Seção "Próximos feriadões" (tela inicial e calendário), com o atalho do monitor. */
export function LongWeekends({ items }: { items: LongWeekendItem[] }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="feriadoes">
      <h2
        id="feriadoes"
        className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400"
      >
        Próximos feriadões
      </h2>
      {items.length ? (
        <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {items.map(({ lw, monitors }) => {
            const bridge = bridgeSuggestion(lw);
            return (
              <li key={lw.start} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{describeLongWeekend(lw)}</span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {longWeekendDays(lw)} dias · {lw.names.join(", ")}
                    </span>
                    {bridge ? (
                      <span className="text-xs text-amber-800 dark:text-amber-300">{bridge}</span>
                    ) : null}
                  </div>
                  {monitors.length ? (
                    <Link
                      href={`/app/monitor/${monitors[0].id}`}
                      className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                    >
                      ✓ Monitorando
                    </Link>
                  ) : (
                    <form action={monitorLongWeekendAction} className="shrink-0">
                      <input type="hidden" name="start" value={lw.start} />
                      <button
                        type="submit"
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                      >
                        Monitorar este feriadão
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">Nenhum feriadão nas próximas 8 semanas.</p>
      )}
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        O monitor cria ida (SP → RJ na véspera à noite ou no 1º dia de manhã) e volta (RJ → SP no
        último dia à tarde ou no dia seguinte cedo), com as janelas da ponte aérea.
      </p>
    </section>
  );
}

/** Selo "feriado perto" de um voo. */
export function NearHolidayBadge({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span
      title={`Perto de ${names.join(", ")}`}
      className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      feriado perto
    </span>
  );
}
