import Link from "next/link";
import { Suspense } from "react";
import { FlightLine } from "@/components/flight-line";
import { getCurrentUser } from "@/lib/auth/current-user";
import { airlineName } from "@/lib/trips/airlines";
import type { BookingDraft, BookingRow, FlightRow } from "@/lib/trips/draft";
import { listTrips } from "@/lib/trips/repo";
import { reviewItems } from "@/lib/trips/review";
import { formatBRL } from "@/lib/trips/summary";
import { PendingButton } from "@/components/pending-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteRepeatedAction,
  fixYearAction,
  keepFlightDateAction,
  restoreAllDeletedAction,
  restoreDeletedAction,
} from "./actions";

export const metadata = { title: "Conferir passagens" };

const card = "flex flex-col gap-3 rounded-xl border border-amber-300 p-4 dark:border-amber-800";
const primary =
  "rounded-xl bg-brand hover:bg-brand-strong px-4 py-2 text-sm font-medium text-white dark:bg-brand-dark dark:text-zinc-950";
const secondary = "rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700";
const br = (iso: string) => iso.split("-").reverse().join("/");

export default function ConferirPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Passagens
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Conferir passagens</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Só o que parece errado depois da importação. Cada item tem a sugestão e um botão: um
          clique e pronto.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Items />
      </Suspense>
      <Suspense fallback={null}>
        <Deleted />
      </Suspense>
    </main>
  );
}

function Summary({ b, flights }: { b: BookingRow; flights: FlightRow[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      {flights.map((f) => (
        <FlightLine key={f.id} f={f} />
      ))}
      <p className="text-xs text-zinc-700 dark:text-zinc-300">
        {[
          airlineName(b.airline),
          b.locator ? `localizador ${b.locator}` : null,
          b.amount_cents != null ? formatBRL(b.amount_cents) : b.miles ? `${b.miles} milhas` : null,
          b.purchased_on ? `compra em ${br(b.purchased_on)}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

async function Items() {
  const user = await getCurrentUser();
  const { bookings, flights } = await listTrips(user.id);
  const items = reviewItems({ bookings, flights, now: new Date().toISOString() });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const flightsOf = (id: string) => flights.filter((f) => f.booking_id === id);

  if (!items.length) {
    return (
      <section className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="font-semibold">Tudo certo ✓</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Nada para conferir agora.</p>
      </section>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {items.map((item, i) => {
        if (item.kind === "date") {
          const b = byId.get(item.bookingId)!;
          const fromYear = Number(item.flightDay.slice(0, 4));
          return (
            <li key={`d-${item.bookingId}`} className={card}>
              <h2 className="font-semibold">
                {i + 1}. Voo em {br(item.flightDay)}, mas a compra foi em {br(item.purchasedOn)}
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {item.suggestedYear
                  ? `O voo está bem antes da compra: quase certamente é de ${item.suggestedYear}, e o ano foi lido errado no e-mail.`
                  : "O voo está poucos dias antes da compra. Confira qual das duas datas está errada."}
              </p>
              <Summary b={b} flights={flightsOf(b.id)} />
              <div className="flex flex-wrap gap-2">
                {item.suggestedYear ? (
                  <form action={fixYearAction}>
                    <input type="hidden" name="booking" value={b.id} />
                    <input type="hidden" name="from" value={fromYear} />
                    <input type="hidden" name="to" value={item.suggestedYear} />
                    <PendingButton className={primary} pendingLabel="Mudando…">
                      Mudar o voo para {item.suggestedYear}
                    </PendingButton>
                  </form>
                ) : null}
                <form action={keepFlightDateAction}>
                  <input type="hidden" name="booking" value={b.id} />
                  <input type="hidden" name="day" value={item.flightDay} />
                  <PendingButton className={secondary} pendingLabel="Ajustando…">
                    O voo está certo (ajustar a data da compra)
                  </PendingButton>
                </form>
                <form action={deleteRepeatedAction}>
                  <input type="hidden" name="booking" value={b.id} />
                  <PendingButton
                    className={`${secondary} text-red-700 dark:text-red-300`}
                    pendingLabel="Apagando…"
                    confirm="Apagar esta passagem? Dá para restaurar depois aqui mesmo."
                  >
                    Não é minha: apagar
                  </PendingButton>
                </form>
              </div>
            </li>
          );
        }
        return (
          <li key={`r-${item.bookingIds.join("-")}`} className={card}>
            <h2 className="font-semibold">
              {i + 1}. A mesma viagem aparece {item.bookingIds.length} vezes (
              {item.route.replace("→", " → ")} em {br(item.day)})
            </h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Normalmente é o mesmo voo vindo de dois e-mails (agência e companhia). Apague a que
              sobrar.
            </p>
            {item.bookingIds.map((id, n) => {
              const b = byId.get(id);
              if (!b) return null;
              return (
                <div key={id} className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Cópia {n + 1}
                  </p>
                  <Summary b={b} flights={flightsOf(id)} />
                  <form action={deleteRepeatedAction}>
                    <input type="hidden" name="booking" value={id} />
                    <PendingButton
                      className={`${secondary} text-red-700 dark:text-red-300`}
                      pendingLabel="Apagando…"
                      confirm={`Apagar a cópia ${n + 1}? A outra continua.`}
                    >
                      Apagar a cópia {n + 1}
                    </PendingButton>
                  </form>
                </div>
              );
            })}
          </li>
        );
      })}
    </ol>
  );
}

/** Passagens importadas que foram apagadas (rascunho guardado por 30 dias): restaurar. */
async function Deleted() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("import_candidates")
    .select("id, draft, received_at")
    .eq("user_id", user.id)
    .eq("status", "imported")
    .is("booking_id", null)
    .order("received_at", { ascending: false });
  if (!data?.length) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="apagadas">
      <h2 id="apagadas" className="text-lg font-semibold">
        Apagadas ({data.length})
      </h2>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Passagens importadas do Gmail que foram apagadas. Restaure as que eram suas.
      </p>
      <form action={restoreAllDeletedAction}>
        <PendingButton className={primary} pendingLabel="Restaurando…">
          Restaurar todas ({data.length})
        </PendingButton>
      </form>
      <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {data.map((c) => {
          const d = c.draft as BookingDraft;
          const first = d.legs[0];
          return (
            <li key={c.id as string} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-col gap-0.5 text-sm">
                <span className="font-medium">
                  {d.legs.map((l) => `${l.origin} → ${l.destination}`).join(" · ")} ·{" "}
                  {airlineName(d.airline)}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {first
                    ? `${br(first.departure_local.slice(0, 10))} ${first.departure_local.slice(11, 16)}`
                    : ""}
                  {d.locator ? ` · localizador ${d.locator}` : ""}
                  {d.amount ? ` · R$ ${d.amount}` : ""}
                </span>
              </div>
              <form action={restoreDeletedAction}>
                <input type="hidden" name="candidate" value={c.id as string} />
                <PendingButton className={secondary} pendingLabel="Restaurando…">
                  Restaurar
                </PendingButton>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
