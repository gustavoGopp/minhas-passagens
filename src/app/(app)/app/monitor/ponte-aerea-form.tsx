"use client";
import { useActionState } from "react";
import { createPonteAereaAction, type MonitorFormState } from "./actions";

const input =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function PonteAereaForm() {
  const [state, action, pending] = useActionState<MonitorFormState, FormData>(
    createPonteAereaAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Alvo por trecho (R$)
          <input className={input} name="target" inputMode="decimal" defaultValue="250" required />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Margem (R$)
          <input className={input} name="margin" inputMode="decimal" defaultValue="50" />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-300">{state.message}</p>
      ) : null}
      <button
        disabled={pending}
        className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "Criando…" : "Criar ponte aérea semanal"}
      </button>
    </form>
  );
}
