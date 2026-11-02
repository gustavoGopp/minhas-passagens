"use client";
import { useActionState, useState } from "react";
import { addCreditAction, type CreditFormState } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900";
const label = "flex flex-col gap-1 text-sm font-medium";

/** Registra reembolso em dinheiro ou crédito/voucher, opcionalmente ligado a uma passagem. */
export function CreditForm({
  bookingId,
  defaultProvider,
}: {
  bookingId?: string;
  defaultProvider?: string;
}) {
  const [state, action, pending] = useActionState<CreditFormState, FormData>(addCreditAction, {});
  const [kind, setKind] = useState<"refund" | "credit">("credit");
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="booking_id" value={bookingId ?? ""} />
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Tipo
          <select
            className={input}
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "refund" | "credit")}
          >
            <option value="credit">Crédito/voucher</option>
            <option value="refund">Reembolso em dinheiro</option>
          </select>
        </label>
        <label className={label}>
          Valor (R$)
          <input className={input} name="amount" inputMode="decimal" placeholder="0,00" required />
        </label>
        <label className={label}>
          {kind === "refund" ? "Recebido em" : "Emitido em"}
          <input
            className={input}
            type="date"
            name="issued_on"
            defaultValue={new Date().toISOString().slice(0, 10)}
            required
          />
        </label>
        {kind === "credit" ? (
          <label className={label}>
            Validade
            <input className={input} type="date" name="expires_on" />
          </label>
        ) : (
          <input type="hidden" name="expires_on" value="" />
        )}
        <label className={`${label} col-span-2`}>
          Companhia ou agência
          <input
            className={input}
            name="provider"
            defaultValue={defaultProvider ?? ""}
            placeholder="Ex.: Azul, 123milhas"
          />
        </label>
        <label className={`${label} col-span-2`}>
          Observações
          <input className={input} name="notes" placeholder="Ex.: código do voucher" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-sm text-green-700 dark:text-green-300">Registrado.</p> : null}
      <button
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : "Registrar"}
      </button>
    </form>
  );
}
