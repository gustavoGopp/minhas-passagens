"use client";
import { useActionState } from "react";
import { addCustomHolidayAction, type AddHolidayState } from "./actions";

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

export function AddHolidayForm({ defaultDate }: { defaultDate: string }) {
  const [state, action, pending] = useActionState<AddHolidayState, FormData>(
    addCustomHolidayAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr]">
        <input className={inputClass} type="date" name="date" defaultValue={defaultDate} required />
        <input
          className={inputClass}
          name="name"
          placeholder="Nome (ex.: Aniversário de Niterói)"
          required
        />
      </div>
      <div className="flex gap-2">
        <select className={`${inputClass} flex-1`} name="kind" defaultValue="holiday">
          <option value="holiday">Feriado</option>
          <option value="optional">Ponto facultativo</option>
          <option value="observance">Só uma data</option>
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Salvando…" : "Adicionar"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-300">Feriado adicionado.</p>
      ) : null}
    </form>
  );
}
