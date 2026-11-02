import Link from "next/link";
import { Suspense } from "react";
import { FlightLine, relativeTime } from "@/components/flight-line";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getHolidays, holidaysNear } from "@/lib/holidays";
import { getProfile, holidayPreferences } from "@/lib/profiles/repo";
import { toggleCheckinAction } from "./passagens/actions";
import { listTrips } from "@/lib/trips/repo";
import { formatBRL, monthlySpend, pastFlights, upcomingFlights } from "@/lib/trips/summary";

export const metadata = { title: "Passagens" };

export default function AppHome() {
  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Passagens</h1>
        <Link
          href="/app/passagens/nova"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          + Nova
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando passagens…</p>}>
        <Trips />
      </Suspense>
    </main>
  );
}

async function Trips() {
  const user = await getCurrentUser();
  const now = new Date().toISOString();
  const [{ bookings, flights }, profile] = await Promise.all([
    listTrips(user.id),
    getProfile(user.id),
  ]);
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const upcoming = upcomingFlights(flights, byId, now);
  const past = pastFlights(flights, now).slice(0, 10);
  const spend = monthlySpend(bookings);
  const thisMonth = spend.find((s) => s.month === now.slice(0, 7));
  const next = upcoming[0];

  const year = Number(now.slice(0, 4));
  const holidays = [
    ...getHolidays(year, holidayPreferences(profile)),
    ...getHolidays(year + 1, holidayPreferences(profile)),
  ];
  const nearNext = next ? holidaysNear(holidays, next.departs_at.slice(0, 10), 2) : [];

  if (flights.length === 0) {
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <p>Nenhuma passagem ainda.</p>
        <p>
          Toque em <strong>+ Nova</strong> e cole o e-mail de confirmação, envie um print ou
          preencha à mão.
        </p>
      </section>
    );
  }

  return (
    <>
      {next ? (
        <section className="flex flex-col gap-3 rounded-2xl bg-zinc-900 p-5 text-white dark:bg-zinc-100 dark:text-zinc-900">
          <div className="flex items-center justify-between text-xs tracking-wide uppercase opacity-80">
            <span>Próximo voo</span>
            <span>{relativeTime(next.departs_at, now)}</span>
          </div>
          <FlightLine f={next} big />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {byId.get(next.booking_id)?.locator ? (
              <span className="rounded-md bg-white/15 px-2 py-1 font-mono dark:bg-black/10">
                {byId.get(next.booking_id)?.locator}
              </span>
            ) : null}
            {nearNext.map((h) => (
              <span
                key={h.key + h.date}
                className="rounded-md bg-amber-400/90 px-2 py-1 text-xs text-black"
              >
                Perto de {h.name}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2">
            <form action={toggleCheckinAction}>
              <input type="hidden" name="flight_id" value={next.id} />
              <input type="hidden" name="done" value={String(!next.checkin_done)} />
              <button
                className="rounded-lg bg-white/15 px-3 py-2 text-sm dark:bg-black/10"
                type="submit"
              >
                {next.checkin_done ? "✓ Check-in feito" : "Marcar check-in feito"}
              </button>
            </form>
            <Link
              className="text-sm underline underline-offset-4"
              href={`/app/passagens/${next.booking_id}`}
            >
              Detalhes
            </Link>
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum voo futuro.</p>
      )}

      {upcoming.length > 1 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Próximos</h2>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {upcoming.slice(1).map((f) => (
              <li key={f.id}>
                <Link
                  href={`/app/passagens/${f.booking_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <FlightLine f={f} />
                  <span className="shrink-0 text-xs text-zinc-500">
                    {relativeTime(f.departs_at, now)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Gasto neste mês</p>
          <p className="text-lg font-semibold">{formatBRL(thisMonth?.cents ?? 0)}</p>
          {thisMonth?.miles ? (
            <p className="text-xs text-zinc-500">
              + {thisMonth.miles.toLocaleString("pt-BR")} milhas
            </p>
          ) : null}
        </div>
        <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <p className="text-xs text-zinc-500">Voos futuros</p>
          <p className="text-lg font-semibold">{upcoming.length}</p>
        </div>
      </section>

      {past.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">
            Anteriores
          </h2>
          <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 opacity-80 dark:divide-zinc-800 dark:border-zinc-800">
            {past.map((f) => (
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
        </section>
      ) : null}
    </>
  );
}
