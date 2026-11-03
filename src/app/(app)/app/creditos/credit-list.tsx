import Link from "next/link";
import type { CreditRow } from "@/lib/trips/rules";
import { formatBRL } from "@/lib/trips/summary";
import { deleteCreditAction, updateRemainingAction } from "./actions";

const brDate = (iso: string) => iso.split("-").reverse().join("/");

export function CreditList({
  credits,
  today,
  showBookingLink = true,
}: {
  credits: CreditRow[];
  today: string;
  showBookingLink?: boolean;
}) {
  if (!credits.length)
    return <p className="text-sm text-zinc-600 dark:text-zinc-400">Nada registrado.</p>;
  return (
    <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {credits.map((c) => {
        const expired = c.expires_on != null && c.expires_on < today;
        return (
          <li key={c.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {c.kind === "refund" ? "Reembolso" : "Crédito"} · {c.provider ?? "sem fornecedor"}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {formatBRL(c.amount_cents)} em {brDate(c.issued_on)}
                  {c.expires_on
                    ? ` · validade ${brDate(c.expires_on)}${expired ? " (vencido)" : ""}`
                    : ""}
                  {c.notes ? ` · ${c.notes}` : ""}
                </span>
                {showBookingLink && c.booking_id ? (
                  <Link
                    className="text-xs underline underline-offset-2"
                    href={`/app/passagens/${c.booking_id}`}
                  >
                    Ver passagem
                  </Link>
                ) : null}
              </div>
              <form action={deleteCreditAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="booking_id" value={c.booking_id ?? ""} />
                <button className="text-xs text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
                  Apagar
                </button>
              </form>
            </div>
            {c.kind === "credit" && !expired ? (
              <form action={updateRemainingAction} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="id" value={c.id} />
                <label
                  htmlFor={`saldo-${c.id}`}
                  className="text-xs text-zinc-600 dark:text-zinc-400"
                >
                  Saldo
                </label>
                <input
                  id={`saldo-${c.id}`}
                  name="remaining"
                  inputMode="decimal"
                  defaultValue={((c.remaining_cents ?? c.amount_cents) / 100)
                    .toFixed(2)
                    .replace(".", ",")}
                  className="w-28 rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button className="text-xs underline underline-offset-2">Atualizar</button>
              </form>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
