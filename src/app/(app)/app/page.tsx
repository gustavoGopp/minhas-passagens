import Link from "next/link";
import { Suspense } from "react";
import { FlightLine, relativeTime } from "@/components/flight-line";
import { LongWeekends, NearHolidayBadge } from "@/components/long-weekends";
import { getCurrentUser } from "@/lib/auth/current-user";
import { loadHolidayContext } from "@/lib/holidays/context";
import { holidaysNearFlight } from "@/lib/notify/holiday-events";
import {
  ignoreMissingLegAction,
  ignoreMissingReturnAction,
  toggleCheckinAction,
} from "./passagens/actions";
import { checkinRule, checkinState } from "@/lib/trips/checkin";
import { listCredits } from "@/lib/trips/credits-repo";
import { spendByMonth } from "@/lib/trips/reports";
import { Card } from "@/components/ui";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { getMailAccount } from "@/lib/mail/accounts";
import { onboardingSteps } from "@/lib/onboarding";
import { listMonitors } from "@/lib/prices/repo";
import { getProfile } from "@/lib/profiles/repo";
import { reviewItems } from "@/lib/trips/review";
import { computeAlerts, type TripAlert } from "@/lib/trips/rules";
import { formatInZone } from "@/lib/trips/time";
import { airportTimeZone, findAirport } from "@/lib/airports";
import { airlineName } from "@/lib/trips/airlines";
import type { FlightRow } from "@/lib/trips/draft";
import { listTrips } from "@/lib/trips/repo";
import { formatBRL, groupByLocalYear, pastFlights, upcomingFlights } from "@/lib/trips/summary";

export const metadata = { title: "Passagens" };

export default function AppHome() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Passagens</h1>
        <div className="flex items-center gap-3">
          <Link href="/app/passagens/importar" className="text-sm underline underline-offset-4">
            Importar do Gmail
          </Link>
          <Link
            href="/app/passagens/nova"
            className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-2 text-sm font-medium text-white dark:text-zinc-950"
          >
            + Nova
          </Link>
        </div>
      </div>
      <Suspense fallback={null}>
        <StartHere />
      </Suspense>
      <Suspense
        fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando passagens…</p>}
      >
        <Trips />
      </Suspense>
    </main>
  );
}

async function Trips() {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const [{ bookings, flights }, ctx, credits] = await Promise.all([
    listTrips(user.id),
    loadHolidayContext(user.id),
    listCredits(user.id),
  ]);
  const alerts = computeAlerts({
    bookings,
    flights,
    credits,
    now,
    homeCity: ctx.profile?.home_city ?? null,
  });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const toReview = reviewItems({ bookings, flights, now }).length;
  const upcoming = upcomingFlights(flights, byId, now);
  const past = pastFlights(flights, now).slice(0, 10);
  const thisMonth = spendByMonth(bookings, credits).find((m) => m.month === now.slice(0, 7));
  const next = upcoming[0];
  const currentYear = Number(ctx.today.slice(0, 4));

  const nearNames = (f: (typeof flights)[number]) => [
    ...new Set(holidaysNearFlight(ctx.holidays, f).map((h) => h.name)),
  ];
  const nearNext = next ? holidaysNearFlight(ctx.holidays, next) : [];

  if (flights.length === 0) {
    return (
      <>
        <section className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p>Nenhuma passagem ainda.</p>
          <p>
            Toque em <strong>+ Nova</strong> e cole o e-mail de confirmação, envie um print ou
            preencha à mão. Ou{" "}
            <Link className="underline underline-offset-4" href="/app/passagens/importar">
              importe direto do seu Gmail
            </Link>
            .
          </p>
        </section>
        <LongWeekends items={ctx.longWeekends} />
      </>
    );
  }

  return (
    <>
      {toReview ? (
        <Link
          href="/app/conferir"
          className="flex items-center justify-between gap-3 rounded-xl bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950 dark:bg-amber-900 dark:text-amber-50"
        >
          <span>
            {toReview} {toReview === 1 ? "passagem para conferir" : "passagens para conferir"} (data
            ou repetida)
          </span>
          <span className="underline underline-offset-4">Conferir agora →</span>
        </Link>
      ) : null}
      {alerts.filter((a) => a.type !== "check_date").length ? (
        <Alerts alerts={alerts.filter((a) => a.type !== "check_date")} />
      ) : null}
      {next ? (
        <BoardingPass
          flight={next}
          locator={byId.get(next.booking_id)?.locator ?? null}
          now={now}
          near={nearNext.map((h) => h.name)}
        />
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum voo futuro.</p>
      )}

      {upcoming.length > 1 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
            Próximos
          </h2>
          {groupByLocalYear(upcoming.slice(1)).map((g, gi, all) => (
            <YearGroup key={g.year} year={g.year} show={all.length > 1 || g.year !== currentYear}>
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {g.items.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={`/app/passagens/${f.booking_id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <FlightLine f={f} />
                      <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {relativeTime(f.departs_at, now)}
                        <NearHolidayBadge names={nearNames(f)} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </YearGroup>
          ))}
        </section>
      ) : null}

      <LongWeekends items={ctx.longWeekends} />

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Gasto neste mês</p>
          <p className="text-lg font-semibold">{formatBRL(thisMonth?.netCents ?? 0)}</p>
          {thisMonth?.miles ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              + {thisMonth.miles.toLocaleString("pt-BR")} milhas
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Voos futuros</p>
          <p className="text-lg font-semibold">{upcoming.length}</p>
        </div>
      </section>

      {past.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
            Anteriores
          </h2>
          {groupByLocalYear(past).map((g, gi, all) => (
            <YearGroup key={g.year} year={g.year} show={all.length > 1 || g.year !== currentYear}>
              <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {g.items.map((f) => (
                  <li key={f.id}>
                    <Link href={`/app/passagens/${f.booking_id}`} className="block px-4 py-3">
                      <FlightLine f={f} />
                      {byId.get(f.booking_id)?.status === "cancelled" ? (
                        <span className="text-xs text-red-700 dark:text-red-300">Cancelada</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </YearGroup>
          ))}
        </section>
      ) : null}
    </>
  );
}

function CheckinLine({
  flight,
  now,
}: {
  flight: { airline: string; origin: string; departs_at: string; checkin_done: boolean };
  now: string;
}) {
  const st = checkinState(flight, now);
  const tz = airportTimeZone(flight.origin) ?? "America/Sao_Paulo";
  const url = checkinRule(flight.airline).url;
  if (st.state === "done" || st.state === "closed") return null;
  if (st.state === "not_open")
    return (
      <p className="text-on-brand-muted text-sm dark:text-zinc-300">
        Check-in abre {formatInZone(st.opensAt, tz)}
      </p>
    );
  return (
    <p className="text-sm font-semibold">
      Check-in aberto até {formatInZone(st.closesAt, tz)}
      {url ? (
        <>
          {" · "}
          <a className="underline underline-offset-4" href={url} target="_blank" rel="noreferrer">
            fazer agora
          </a>
        </>
      ) : null}
    </p>
  );
}

const ALERT_STYLE: Record<TripAlert["severity"], string> = {
  high: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  medium:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  low: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
};

function Alerts({ alerts }: { alerts: TripAlert[] }) {
  return (
    <section className="flex flex-col gap-2" aria-label="Atenção">
      {alerts.map((a) => (
        <div
          key={a.key}
          className={`flex flex-col gap-1 rounded-xl border p-3 text-sm ${ALERT_STYLE[a.severity]}`}
        >
          <span className="font-medium">{a.title}</span>
          <span className="text-xs">{a.detail}</span>
          <div className="flex flex-wrap gap-3 text-xs">
            {a.bookingIds[0] ? (
              <Link
                className="underline underline-offset-2"
                href={
                  a.type === "credit_expiring"
                    ? "/app/creditos"
                    : `/app/passagens/${a.bookingIds[0]}`
                }
              >
                {a.type === "duplicate" ? "Ver a 1ª" : "Ver"}
              </Link>
            ) : a.type === "credit_expiring" ? (
              <Link className="underline underline-offset-2" href="/app/creditos">
                Ver créditos
              </Link>
            ) : null}
            {a.type === "missing_leg" ? (
              <form action={ignoreMissingLegAction}>
                <input type="hidden" name="flight_id" value={a.flightIds[1]} />
                <button className="underline underline-offset-2" type="submit">
                  Cheguei por outro meio
                </button>
              </form>
            ) : null}
            {a.type === "duplicate" && a.bookingIds[1] ? (
              <Link
                className="underline underline-offset-2"
                href={`/app/passagens/${a.bookingIds[1]}`}
              >
                Ver a 2ª (apagar se for repetida)
              </Link>
            ) : null}
            {a.type === "missing_return" ? (
              <form action={ignoreMissingReturnAction}>
                <input type="hidden" name="flight_id" value={a.flightIds[0]} />
                <button className="underline underline-offset-2" type="submit">
                  Volto por outro meio
                </button>
              </form>
            ) : null}
            {a.type === "checkin" ? (
              <form action={toggleCheckinAction}>
                <input type="hidden" name="flight_id" value={a.flightIds[0]} />
                <input type="hidden" name="done" value="true" />
                <button className="underline underline-offset-2" type="submit">
                  Já fiz o check-in
                </button>
              </form>
            ) : null}
          </div>
        </div>
      ))}
    </section>
  );
}

/** Bloco de um ano numa lista de voos: o ano vira título para nunca misturar anos. */
function YearGroup({
  year,
  show,
  children,
}: {
  year: number;
  show: boolean;
  children: React.ReactNode;
}) {
  if (!show) return <>{children}</>;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-base font-semibold tabular-nums">{year}</h3>
      {children}
    </div>
  );
}

/**
 * Próximo voo como cartão de embarque: rota grande à esquerda e, depois do
 * picote, o canhoto com localizador e check-in (verde quando o check-in abre).
 */
function BoardingPass({
  flight: f,
  locator,
  now,
  near,
}: {
  flight: FlightRow;
  locator: string | null;
  now: string;
  near: string[];
}) {
  const tz = airportTimeZone(f.origin) ?? "America/Sao_Paulo";
  const arrTz = airportTimeZone(f.destination) ?? "America/Sao_Paulo";
  const open = checkinState(f, now).state === "open";
  const time = (iso: string, zone: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: zone,
    }).format(new Date(iso));
  const city = (iata: string) => findAirport(iata)?.city ?? iata;
  return (
    <section
      aria-label={`Próximo voo: ${f.origin} para ${f.destination}`}
      className="bg-brand dark:bg-brand-dark-soft relative overflow-hidden rounded-3xl text-white shadow-md sm:flex dark:text-zinc-100"
    >
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
          <span className="text-on-brand-muted dark:text-zinc-300">Próximo voo</span>
          <span className="rounded-full bg-white/15 px-2.5 py-1 normal-case">
            {relativeTime(f.departs_at, now)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="font-mono text-4xl font-semibold tracking-tight">{f.origin}</span>
            <span className="text-on-brand-muted text-xs dark:text-zinc-300">{city(f.origin)}</span>
          </div>
          <svg
            viewBox="0 0 24 24"
            className="mb-5 h-6 w-6 shrink-0"
            fill="currentColor"
            aria-hidden
          >
            <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z" />
          </svg>
          <div className="flex flex-col items-end">
            <span className="font-mono text-4xl font-semibold tracking-tight">{f.destination}</span>
            <span className="text-on-brand-muted text-xs dark:text-zinc-300">
              {city(f.destination)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{formatInZone(f.departs_at, tz)}</span>
          {f.arrives_at ? (
            <span className="text-on-brand-muted tabular-nums dark:text-zinc-300">
              chega {time(f.arrives_at, arrTz)}
            </span>
          ) : null}
        </div>
        <p className="text-on-brand-muted text-xs dark:text-zinc-300">
          {[airlineName(f.airline), f.flight_number, findAirport(f.origin)?.name]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {near.length ? (
          <p className="self-start rounded-md bg-amber-300 px-2 py-1 text-xs font-medium text-zinc-950">
            Perto de {[...new Set(near)].join(", ")}
          </p>
        ) : null}
      </div>

      {/* Picote: linha tracejada com os dois recortes do cartão. */}
      <div
        aria-hidden
        className="relative h-0 border-t-2 border-dashed border-white/40 sm:h-auto sm:w-0 sm:border-t-0 sm:border-l-2"
      >
        <span className="bg-background absolute -top-3 -left-3 h-6 w-6 rounded-full sm:-top-3 sm:-left-3" />
        <span className="bg-background absolute -top-3 -right-3 h-6 w-6 rounded-full sm:top-auto sm:-bottom-3 sm:-left-3" />
      </div>

      <div
        className={`flex flex-col gap-3 p-5 sm:w-60 ${open ? "bg-green-700 dark:bg-green-900" : ""}`}
      >
        {locator ? (
          <div className="flex flex-col">
            <span className="text-on-brand-muted text-xs font-semibold tracking-wider uppercase dark:text-zinc-300">
              Localizador
            </span>
            <span className="font-mono text-2xl font-semibold tracking-[0.2em]">{locator}</span>
          </div>
        ) : null}
        <CheckinLine flight={f} now={now} />
        <div className="flex items-center justify-between gap-2">
          <form action={toggleCheckinAction}>
            <input type="hidden" name="flight_id" value={f.id} />
            <input type="hidden" name="done" value={String(!f.checkin_done)} />
            <button
              className="rounded-xl bg-white/15 px-3 py-2 text-sm font-medium hover:bg-white/25"
              type="submit"
            >
              {f.checkin_done ? "✓ Check-in feito" : "Marcar check-in feito"}
            </button>
          </form>
          <Link
            className="text-sm font-medium underline underline-offset-4"
            href={`/app/passagens/${f.booking_id}`}
          >
            Detalhes
          </Link>
        </div>
      </div>
    </section>
  );
}

/** "Comece por aqui": some quando tudo estiver configurado. */
async function StartHere() {
  const user = await getCurrentUser();
  const [account, integrations, profile, monitors] = await Promise.all([
    getMailAccount(user.id).catch(() => null),
    listIntegrationsPublic(user.id),
    getProfile(user.id),
    listMonitors(user.id),
  ]);
  const has = (p: string) => integrations.some((i) => i.provider === p);
  const steps = onboardingSteps({
    gmailActive: account?.status === "active",
    hasAnthropic: has("anthropic"),
    emailAlerts:
      Boolean((profile as { notify_email?: boolean } | null)?.notify_email) && has("resend"),
    homeCity: Boolean(profile?.home_city),
    monitors: monitors.length,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card aria-labelledby="comece">
      <div className="flex items-center justify-between gap-3">
        <h2 id="comece" className="font-semibold">
          Comece por aqui
        </h2>
        <span className="text-xs font-medium text-zinc-600 tabular-nums dark:text-zinc-400">
          {done} de {steps.length}
        </span>
      </div>
      <ol className="flex flex-col gap-1">
        {steps.map((s) => (
          <li key={s.key}>
            <Link
              href={s.href}
              className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  s.done
                    ? "bg-green-700 text-white"
                    : "border-2 border-zinc-300 dark:border-zinc-600"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <span className="flex flex-col">
                <span
                  className={`text-sm font-medium ${s.done ? "line-through decoration-zinc-400" : ""}`}
                >
                  {s.title}
                  <span className="sr-only">{s.done ? " (feito)" : " (falta)"}</span>
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{s.why}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
