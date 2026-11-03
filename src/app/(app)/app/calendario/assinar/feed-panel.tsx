"use client";
import { useActionState, useState } from "react";
import { button } from "@/components/ui";
import { feedAction, type FeedState } from "./actions";

export function FeedPanel({ active, status }: { active: boolean; status: string | null }) {
  const [state, action, pending] = useActionState<FeedState, FormData>(feedAction, {});
  const url = state.url ?? null;
  const isActive = url ? true : state.off ? false : active;

  return (
    <div className="flex flex-col gap-4">
      {url ? <NewLink url={url} /> : null}

      {isActive && status && !url ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{status}</p>
      ) : null}
      {!isActive ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">Nenhum link ativo.</p>
      ) : null}

      <form action={action} className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="intent"
          value="gerar"
          disabled={pending}
          className={isActive ? button.secondary : button.primary}
          onClick={(e) => {
            if (
              isActive &&
              !window.confirm("Gerar um novo link? O link atual para de funcionar na hora.")
            )
              e.preventDefault();
          }}
        >
          {pending ? "Salvando…" : isActive ? "Gerar novo link" : "Gerar link"}
        </button>
        {isActive ? (
          <button
            type="submit"
            name="intent"
            value="desligar"
            disabled={pending}
            className={button.danger}
            onClick={(e) => {
              if (!window.confirm("Desligar o link? Os voos somem do seu calendário.")) {
                e.preventDefault();
              }
            }}
          >
            Desligar
          </button>
        ) : null}
      </form>
      {state.off ? (
        <p role="status" className="text-sm text-zinc-700 dark:text-zinc-300">
          Link desligado. Os voos somem do calendário na próxima atualização dele.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function NewLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const webcal = url.replace(/^https?:/, "webcal:");
  return (
    <div className="border-brand/30 bg-brand-soft dark:border-brand-dark/30 dark:bg-brand-dark-soft flex flex-col gap-3 rounded-2xl border p-4">
      <label htmlFor="feed-url" className="text-sm font-semibold">
        Seu link (guarde agora: o app não mostra este link de novo)
      </label>
      <input
        id="feed-url"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button.primary}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            } catch {
              document.getElementById("feed-url")?.focus();
            }
          }}
        >
          Copiar link
        </button>
        <a href={webcal} className={button.secondary}>
          Abrir no iPhone/Mac
        </a>
      </div>
      <p aria-live="polite" className="text-sm text-zinc-700 dark:text-zinc-300">
        {copied ? "Link copiado." : ""}
      </p>
    </div>
  );
}
