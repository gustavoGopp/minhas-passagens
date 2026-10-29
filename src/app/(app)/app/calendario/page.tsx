import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHolidays, REGIONAL_SOURCE, type HolidayEvent } from "@/lib/holidays";
import { listOverrides } from "@/lib/holidays/repo";
import { getProfile, holidayPreferences } from "@/lib/profiles/repo";
import { hideHolidayAction, removeOverrideAction } from "./actions";
import { AddHolidayForm } from "./add-holiday-form";

export const metadata = { title: "Calendário" };

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const KIND_LABEL: Record<HolidayEvent["kind"], { text: string; cls: string }> = {
  holiday: { text: "Feriado", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  optional: {
    text: "Facultativo",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  observance: {
    text: "Data",
    cls: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

export default function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string }>;
}) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando feriados…</p>}>
        <Calendar searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Calendar({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const user = await getCurrentUser();
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const requested = Number((await searchParams).ano);
  const year =
    Number.isInteger(requested) && requested >= 1900 && requested <= 2200 ? requested : currentYear;

  const [profile, overrides] = await Promise.all([getProfile(user.id), listOverrides(user.id)]);
  const events = getHolidays(year, holidayPreferences(profile), overrides);
  const customIds = new Map(
    overrides.filter((o) => o.action === "add").map((o) => [`${o.date}|${o.name}`, o.id]),
  );
  const hidden = overrides.filter((o) => o.action === "hide" && o.date.startsWith(`${year}-`));
  const nextKey = events.find((e) => e.endDate >= today && e.kind !== "observance");

  const byMonth = new Map<number, HolidayEvent[]>();
  for (const e of events) {
    const m = e.date.startsWith(`${year}-`) ? Number(e.date.slice(5, 7)) : 1;
    byMonth.set(m, [...(byMonth.get(m) ?? []), e]);
  }

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Feriados {year}</h1>
        <nav className="flex gap-2 text-sm">
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1 dark:border-zinc-700"
            href={`/app/calendario?ano=${year - 1}`}
          >
            ← {year - 1}
          </Link>
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1 dark:border-zinc-700"
            href={`/app/calendario?ano=${year + 1}`}
          >
            {year + 1} →
          </Link>
        </nav>
      </header>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {profile?.uf ? `Nacionais + ${profile.uf}` : "Só nacionais"}
        {profile?.holiday_city ? " + sua cidade" : ""}
        {profile?.show_jewish_holidays ? " + judaicos" : ""}
        {profile?.show_christian_holidays ? " + cristãos" : ""}.{" "}
        <Link className="underline underline-offset-2" href="/app/perfil">
          Ajustar no perfil
        </Link>
      </p>

      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            {MONTHS[month - 1]}
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {list.map((e) => (
              <HolidayRow
                key={`${e.key}-${e.date}`}
                event={e}
                isNext={nextKey === e}
                customId={e.source === "custom" ? customIds.get(`${e.date}|${e.name}`) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold">Adicionar feriado</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Para feriados da sua cidade que não estão na lista, ou datas que importam para você.
        </p>
        <AddHolidayForm defaultDate={`${year}-01-01`} />
      </section>

      {hidden.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            Ocultados em {year}
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {hidden.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2">
                <span>
                  {formatDate(h.date)} · {h.key}
                </span>
                <form action={removeOverrideAction}>
                  <input type="hidden" name="id" value={h.id} />
                  <button className="text-xs underline underline-offset-2" type="submit">
                    Mostrar de novo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Feriados estaduais e municipais: {REGIONAL_SOURCE}. Pontos facultativos federais mudam por
        portaria a cada ano; confira com seu empregador.
      </p>
    </>
  );
}

function HolidayRow({
  event: e,
  isNext,
  customId,
}: {
  event: HolidayEvent;
  isNext: boolean;
  customId?: string;
}) {
  const kind = KIND_LABEL[e.kind];
  const multi = e.endDate !== e.date;
  return (
    <li
      className={`flex items-start justify-between gap-3 px-4 py-3 ${isNext ? "bg-zinc-50 dark:bg-zinc-900" : ""}`}
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          {e.name}
          {isNext ? <span className="ml-2 text-xs font-normal text-zinc-500">próximo</span> : null}
        </span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {formatDate(e.date)}
          {multi ? ` a ${formatDate(e.endDate)}` : ""} · {sourceLabel(e)}
          {e.startsAtSunset ? " · começa ao pôr do sol da véspera" : ""}
          {e.fast ? " · jejum" : ""}
        </span>
        {e.note ? <span className="text-xs text-zinc-500 dark:text-zinc-400">{e.note}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kind.cls}`}>
          {kind.text}
        </span>
        {customId ? (
          <form action={removeOverrideAction}>
            <input type="hidden" name="id" value={customId} />
            <button className="text-xs text-zinc-500 underline underline-offset-2" type="submit">
              Remover
            </button>
          </form>
        ) : (
          <form action={hideHolidayAction}>
            <input type="hidden" name="date" value={e.date} />
            <input type="hidden" name="key" value={e.key} />
            <button className="text-xs text-zinc-500 underline underline-offset-2" type="submit">
              Ocultar
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function sourceLabel(e: HolidayEvent): string {
  switch (e.source) {
    case "br_national":
      return "Nacional";
    case "br_state":
      return e.region.replace("BR-", "Estadual ");
    case "br_city":
      return "Municipal";
    case "jewish":
      return e.region === "JEWISH-IL" ? "Judaico (Israel)" : "Judaico";
    case "christian":
      return "Cristão";
    case "custom":
      return "Seu";
  }
}
