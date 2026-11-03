"use client";
import { useActionState } from "react";
import { checkNowAction, type MonitorFormState } from "../actions";

export function CheckNowButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<MonitorFormState, FormData>(checkNowAction, {});
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-3 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
      >
        {pending ? "Verificando…" : "Verificar agora"}
      </button>
      {state.error ? (
        <p role="alert" className="max-w-xs text-xs text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="max-w-xs text-xs text-green-700 dark:text-green-300">{state.message}</p>
      ) : null}
    </form>
  );
}
