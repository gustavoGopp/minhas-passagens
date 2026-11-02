"use client";
import { useActionState } from "react";
import { sendTestAction, type TestState } from "./actions";

export function TestButton() {
  const [state, action, pending] = useActionState<TestState>(sendTestAction, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <button
        disabled={pending}
        className="self-start rounded-lg border border-zinc-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-zinc-700"
      >
        {pending ? "Enviando…" : "Enviar aviso de teste"}
      </button>
      {state.result ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.result}</p>
      ) : null}
    </form>
  );
}
