"use client";
import { useActionState } from "react";
import { telegramLinkAction, type LinkState } from "./actions";

export function TelegramConnect() {
  const [state, action, pending] = useActionState<LinkState>(telegramLinkAction, {});
  return (
    <div className="flex flex-col gap-2">
      {state.url ? (
        <a
          href={state.url}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white"
        >
          Abrir o Telegram e tocar em Iniciar
        </a>
      ) : (
        <form action={action}>
          <button
            disabled={pending}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {pending ? "Gerando link…" : "Conectar Telegram"}
          </button>
        </form>
      )}
      {state.url ? (
        <p className="text-xs text-zinc-500">
          O link vale por 15 minutos. Depois de tocar em Iniciar, recarregue esta página.
        </p>
      ) : null}
      {state.error ? <p className="text-sm text-red-700 dark:text-red-300">{state.error}</p> : null}
    </div>
  );
}
