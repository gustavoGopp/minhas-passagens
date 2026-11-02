import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { airlineName, CHANNELS } from "@/lib/trips/airlines";
import { draftFromRows } from "@/lib/trips/draft";
import { getTrip } from "@/lib/trips/repo";
import { formatBRL } from "@/lib/trips/summary";
import { deleteBookingAction, setStatusAction } from "../actions";
import { BookingForm } from "../booking-form";
import { CreditForm } from "../../creditos/credit-form";
import { CreditList } from "../../creditos/credit-list";
import { listCredits } from "@/lib/trips/credits-repo";

export const metadata = { title: "Passagem" };

export default function PassagemPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="flex flex-col gap-6">
      <Link href="/app" className="text-sm text-zinc-500 underline underline-offset-4">
        ← Passagens
      </Link>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [trip, allCredits] = await Promise.all([getTrip(user.id, id), listCredits(user.id)]);
  if (!trip) notFound();
  const credits = allCredits.filter((c) => c.booking_id === id);
  const { booking: b } = trip;
  const price =
    b.channel === "miles"
      ? `${(b.miles ?? 0).toLocaleString("pt-BR")} milhas + ${formatBRL(b.taxes_cents ?? 0)}`
      : b.amount_cents != null
        ? formatBRL(b.amount_cents)
        : "Valor não informado";

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {airlineName(b.airline)}{" "}
          {b.locator ? <span className="font-mono">{b.locator}</span> : null}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {price} · {CHANNELS.find((c) => c.code === b.channel)?.name}
          {b.seller ? ` (${b.seller})` : ""} · {b.tag === "work" ? "Trabalho" : "Pessoal"}
          {b.status === "cancelled"
            ? " · Cancelada"
            : b.status === "rebooked"
              ? " · Remarcada"
              : ""}
        </p>
      </header>

      <BookingForm initial={draftFromRows(b, trip.flights)} />

      <section className="flex flex-col gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <h2 className="font-semibold">Reembolsos e créditos desta passagem</h2>
        <CreditList
          credits={credits}
          today={new Date().toISOString().slice(0, 10)}
          showBookingLink={false}
        />
        <details className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <summary className="cursor-pointer text-sm font-medium">
            Registrar reembolso ou crédito
          </summary>
          <div className="pt-3">
            <CreditForm bookingId={b.id} defaultProvider={b.seller ?? airlineName(b.airline)} />
          </div>
        </details>
      </section>

      <section className="flex flex-wrap gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <form action={setStatusAction}>
          <input type="hidden" name="id" value={b.id} />
          <input
            type="hidden"
            name="status"
            value={b.status === "cancelled" ? "active" : "cancelled"}
          />
          <button
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700"
            type="submit"
          >
            {b.status === "cancelled" ? "Reativar" : "Marcar como cancelada"}
          </button>
        </form>
        <form action={deleteBookingAction}>
          <input type="hidden" name="id" value={b.id} />
          <button
            className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
            type="submit"
          >
            Apagar
          </button>
        </form>
      </section>
    </>
  );
}
