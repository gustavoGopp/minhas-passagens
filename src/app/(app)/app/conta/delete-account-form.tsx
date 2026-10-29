"use client";
import { useActionState } from "react";
import { deleteAccountAction, type DeleteAccountState } from "./actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<DeleteAccountState, FormData>(
    deleteAccountAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input
        name="confirmacao"
        placeholder="Digite APAGAR"
        autoComplete="off"
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        required
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Apagando…" : "Apagar conta"}
      </button>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
