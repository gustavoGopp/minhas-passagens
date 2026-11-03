import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCredits } from "@/lib/trips/credits-repo";
import { creditBalances } from "@/lib/trips/reports";
import { formatBRL } from "@/lib/trips/summary";
import { CreditForm } from "./credit-form";
import { CreditList } from "./credit-list";

export const metadata = { title: "Créditos e reembolsos" };

export default function CreditosPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Créditos e reembolsos</h1>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <Credits />
      </Suspense>
    </main>
  );
}

async function Credits() {
  const user = await getCurrentUser();
  const credits = await listCredits(user.id);
  const today = new Date().toISOString().slice(0, 10);
  const balances = creditBalances(credits, today);
  return (
    <>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
          Saldo de créditos válidos
        </h2>
        {balances.length ? (
          <ul className="grid grid-cols-2 gap-3">
            {balances.map((b) => (
              <li
                key={b.label}
                className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <p className="text-xs text-zinc-600 dark:text-zinc-400">{b.label}</p>
                <p className="text-lg font-semibold">{formatBRL(b.cents)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum crédito com saldo.</p>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
          Registros
        </h2>
        <CreditList credits={credits} today={today} />
      </section>
      <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold">Registrar crédito ou reembolso</h2>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Para ligar a uma passagem específica, registre pela página da passagem.
        </p>
        <CreditForm />
      </section>
    </>
  );
}
