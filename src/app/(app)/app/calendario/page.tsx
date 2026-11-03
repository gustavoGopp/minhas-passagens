import Link from "next/link";
import { Suspense } from "react";
import { FlightLine } from "@/components/flight-line";
import { LongWeekends, NearHolidayBadge } from "@/components/long-weekends";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHolidays, REGIONAL_SOURCE, type HolidayEvent } from "@/lib/holidays";
import { loadHolidayContext } from "@/lib/holidays/context";
import { listOverrides } from "@/lib/holidays/repo";
import { flightLocalDate, holidaysNearFlight } from "@/lib/notify/holiday-events";
import { holidayPreferences } from "@/lib/profiles/repo";
import { activeFlights } from "@/lib/trips/rules";
import { listTrips } from "@/lib/trips/repo";
import { hideHolidayAction, removeOverrideAction } from "./actions";
import { AddHolidayForm } from "./add-holiday-form";
import {
  markDays,
  monthGrid,
  MONTH_NAMES,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  type DayMarks,
} from "@/lib/calendar/grid";

export const metadata = { title: "Calendário" };

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
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  return (
    <main className="flex flex-col gap-6">
      <Suspense
        fallback={
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando calendário…</p>
        }
      >
        <Calendar searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const href = (year: number, month: number) => `/app/calendario?ano=${year}&mes=${month}`;
const shift = (year: number, month: number, delta: number) => {
  const i = year * 12 + (month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};

async function Calendar({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const user = await getCurrentUser();
  const [ctx, overrides, trips, params] = await Promise.all([
    loadHolidayContext(user.id),
    listOverrides(user.id),
    listTrips(user.id),
    searchParams,
  ]);
  const today = ctx.today;
  const currentYear = Number(today.slice(0, 4));
  const reqYear = Number(params.ano);
  const reqMonth = Number(params.mes);
  const year =
    Number.isInteger(reqYear) && reqYear >= 1900 && reqYear <= 2200 ? reqYear : currentYear;
  const month =
    Number.isInteger(reqMonth) && reqMonth >= 1 && reqMonth <= 12
      ? reqMonth
      : year === currentYear
        ? Number(today.slice(5, 7))
        : 1;
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const prev = shift(year, month, -1);
  const next = shift(year, month, 1);

  const profile = ctx.profile;
  const prefs = holidayPreferences(profile);
  const events = getHolidays(year, prefs, overrides);
  // Feriados dos anos vizinhos contam para voos perto da virada do ano.
  const aroundYear = [
    ...getHolidays(year - 1, prefs, overrides),
    ...events,
    ...getHolidays(year + 1, prefs, overrides),
  ];
  const yearFlights = activeFlights(
    trips.flights,
    new Map(trips.bookings.map((b) => [b.id, b])),
  ).filter((f) => flightLocalDate(f).startsWith(`${year}-`));
  const monthFlights = yearFlights.filter((f) => flightLocalDate(f).startsWith(`${ym}-`));
  const monthEvents = events.filter(
    (e) => e.date.startsWith(`${ym}-`) || (e.date < `${ym}-01` && e.endDate >= `${ym}-01`),
  );
  const marks = markDays({ flights: yearFlights.map(flightLocalDate), holidays: events });

  const customIds = new Map(
    overrides.filter((o) => o.action === "add").map((o) => [`${o.date}|${o.name}`, o.id]),
  );
  const hidden = overrides.filter((o) => o.action === "hide" && o.date.startsWith(`${year}-`));
  const nextKey = events.find((e) => e.endDate >= today && e.kind !== "observance");
  const countIn = (m: number) => {
    const key = `${year}-${String(m).padStart(2, "0")}-`;
    return {
      flights: yearFlights.filter((f) => flightLocalDate(f).startsWith(key)).length,
      holidays: events.filter((e) => e.date.startsWith(key) && e.kind !== "observance").length,
    };
  };
  const monthTitle = `${MONTH_NAMES[month - 1]} de ${year}`;

  return (
    <>
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Calendário</h1>
          {ym !== today.slice(0, 7) ? (
            <Link
              className="text-sm underline underline-offset-4"
              href={href(currentYear, Number(today.slice(5, 7)))}
            >
              Ir para hoje
            </Link>
          ) : null}
        </div>
        <nav aria-label="Ano" className="flex items-center gap-2">
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            href={href(year - 1, 1)}
            aria-label={`Ano ${year - 1}`}
          >
            ← {year - 1}
          </Link>
          <span
            className="flex-1 text-center text-3xl font-semibold tabular-nums"
            aria-current="page"
          >
            {year}
          </span>
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            href={href(year + 1, 1)}
            aria-label={`Ano ${year + 1}`}
          >
            {year + 1} →
          </Link>
        </nav>
        <ol
          aria-label={`Meses de ${year}`}
          className="grid grid-cols-6 gap-1 text-center text-xs sm:grid-cols-12"
        >
          {MONTH_NAMES.map((name, i) => {
            const c = countIn(i + 1);
            const active = i + 1 === month;
            return (
              <li key={name}>
                <Link
                  href={href(year, i + 1)}
                  aria-current={active ? "page" : undefined}
                  aria-label={`${name} de ${year}${c.flights ? `, ${c.flights} voo(s)` : ""}`}
                  className={`flex flex-col items-center rounded-lg px-1 py-1.5 ${
                    active
                      ? "bg-brand hover:bg-brand-strong dark:bg-brand-dark text-white dark:text-zinc-950"
                      : "border border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <span className="font-medium">{name.slice(0, 3)}</span>
                  <span className="flex h-2 items-center gap-0.5" aria-hidden>
                    {c.flights ? (
                      <span className="bg-brand dark:bg-brand-dark h-1.5 w-1.5 rounded-full" />
                    ) : null}
                    {c.holidays ? <span className="h-1.5 w-1.5 rounded-full bg-red-600" /> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </header>

      <section aria-labelledby="mes-titulo" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            href={href(prev.year, prev.month)}
            aria-label={`Mês anterior: ${MONTH_NAMES[prev.month - 1]} de ${prev.year}`}
          >
            ←
          </Link>
          <h2 id="mes-titulo" className="text-lg font-semibold">
            {monthTitle}
          </h2>
          <Link
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
            href={href(next.year, next.month)}
            aria-label={`Próximo mês: ${MONTH_NAMES[next.month - 1]} de ${next.year}`}
          >
            →
          </Link>
        </div>
        <MonthGrid year={year} month={month} today={today} marks={marks} />
        <ul
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-700 dark:text-zinc-300"
          aria-label="Legenda"
        >
          <li className="flex items-center gap-1">
            <span
              className="bg-brand dark:bg-brand-dark inline-block h-3 w-3 rounded-full"
              aria-hidden
            />{" "}
            Seu voo
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-red-600" aria-hidden /> Feriado
          </li>
          <li className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full bg-amber-500" aria-hidden /> Ponto
            facultativo
          </li>
          <li className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-full ring-2 ring-zinc-900 dark:ring-zinc-100"
              aria-hidden
            />{" "}
            Hoje
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="voos-mes">
        <h2
          id="voos-mes"
          className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400"
        >
          Seus voos em {monthTitle}
        </h2>
        {monthFlights.length ? (
          <ul className="border-brand/20 bg-brand-soft/60 dark:border-brand-dark/30 dark:bg-brand-dark-soft flex flex-col divide-y divide-zinc-200 rounded-xl border dark:divide-zinc-800">
            {monthFlights.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/app/passagens/${f.booking_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <FlightLine f={f} />
                  <NearHolidayBadge
                    names={[...new Set(holidaysNearFlight(aroundYear, f).map((h) => h.name))]}
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum voo neste mês.</p>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="feriados-mes">
        <h2
          id="feriados-mes"
          className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400"
        >
          Feriados e datas em {monthTitle}
        </h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          {profile?.uf ? `Nacionais + ${profile.uf}` : "Só nacionais"}
          {profile?.holiday_city ? " + sua cidade" : ""}
          {profile?.show_jewish_holidays ? " + judaicos" : ""}
          {profile?.show_christian_holidays ? " + cristãos" : ""}.{" "}
          <Link className="underline underline-offset-2" href="/app/perfil">
            Ajustar no perfil
          </Link>
        </p>
        {monthEvents.length ? (
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {monthEvents.map((e) => (
              <HolidayRow
                key={`${e.key}-${e.date}`}
                event={e}
                isNext={nextKey === e}
                customId={e.source === "custom" ? customIds.get(`${e.date}|${e.name}`) : undefined}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum feriado neste mês.</p>
        )}
      </section>

      {year === currentYear ? <LongWeekends items={ctx.longWeekends} /> : null}

      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Adicionar feriado</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Para feriados da sua cidade que não estão na lista, ou datas que importam para você.
        </p>
        <AddHolidayForm defaultDate={`${ym}-01`} />
      </section>

      {hidden.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
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

      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Feriados estaduais e municipais: {REGIONAL_SOURCE}. Pontos facultativos federais mudam por
        portaria a cada ano; confira com seu empregador.
      </p>
    </>
  );
}

/** Grade do mês (domingo a sábado), só com dias deste mês, com voo, feriado e hoje marcados. */
function MonthGrid({
  year,
  month,
  today,
  marks,
}: {
  year: number;
  month: number;
  today: string;
  marks: Map<string, DayMarks>;
}) {
  return (
    <table className="w-full table-fixed border-collapse text-center">
      <caption className="sr-only">
        {MONTH_NAMES[month - 1]} de {year}
      </caption>
      <thead>
        <tr>
          {WEEKDAYS_SHORT.map((d, i) => (
            <th
              key={i}
              scope="col"
              abbr={WEEKDAYS_LONG[i]}
              className="pb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              {d}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthGrid(year, month).map((week, wi) => (
          <tr key={wi}>
            {week.map((day, di) => {
              if (!day) return <td key={di} />;
              const m = marks.get(day);
              const isToday = day === today;
              const label = [
                `${Number(day.slice(8, 10))} de ${MONTH_NAMES[month - 1].toLowerCase()} de ${year}`,
                m?.flight ? "voo" : null,
                m?.holiday ? "feriado" : null,
                m?.optional ? "ponto facultativo" : null,
                isToday ? "hoje" : null,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <td key={di} className="p-0.5">
                  <span
                    aria-label={label}
                    className={`mx-auto flex h-11 w-full max-w-12 flex-col items-center justify-center rounded-lg text-sm tabular-nums ${
                      m?.flight
                        ? "bg-brand dark:bg-brand-dark font-semibold text-white dark:text-zinc-950"
                        : m?.holiday
                          ? "bg-red-50 font-semibold text-red-800 dark:bg-red-950 dark:text-red-200"
                          : m?.optional
                            ? "bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : ""
                    } ${isToday ? "ring-2 ring-zinc-900 dark:ring-zinc-100" : ""}`}
                  >
                    {Number(day.slice(8, 10))}
                    <span className="flex h-1.5 gap-0.5" aria-hidden>
                      {m?.flight && m.holiday ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-red-200" />
                      ) : null}
                      {m?.flight && m.optional ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-200" />
                      ) : null}
                    </span>
                  </span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
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
          {isNext ? (
            <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
              próximo
            </span>
          ) : null}
        </span>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {formatDate(e.date)}
          {multi ? ` a ${formatDate(e.endDate)}` : ""} · {sourceLabel(e)}
          {e.startsAtSunset ? " · começa ao pôr do sol da véspera" : ""}
          {e.fast ? " · jejum" : ""}
        </span>
        {e.note ? <span className="text-xs text-zinc-600 dark:text-zinc-400">{e.note}</span> : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kind.cls}`}>
          {kind.text}
        </span>
        {customId ? (
          <form action={removeOverrideAction}>
            <input type="hidden" name="id" value={customId} />
            <button
              className="text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
              type="submit"
            >
              Remover
            </button>
          </form>
        ) : (
          <form action={hideHolidayAction}>
            <input type="hidden" name="date" value={e.date} />
            <input type="hidden" name="key" value={e.key} />
            <button
              className="text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
              type="submit"
            >
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
    year: "numeric",
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
