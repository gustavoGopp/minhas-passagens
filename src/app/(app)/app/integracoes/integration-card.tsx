"use client";
import { useActionState } from "react";
import type { IntegrationPublic, Provider } from "@/lib/integrations/repo";
import { removeApiKeyAction, saveApiKeyAction, type IntegrationFormState } from "./actions";

export function IntegrationCard({
  provider,
  info,
  current,
}: {
  provider: Provider;
  info: { name: string; purpose: string; help: string; url: string };
  current: IntegrationPublic | null;
}) {
  const [state, action, pending] = useActionState<IntegrationFormState, FormData>(
    saveApiKeyAction,
    {},
  );
  const status = current
    ? current.status === "active"
      ? { label: `Ativa ${current.key_hint}`, cls: "text-green-700 dark:text-green-300" }
      : { label: `Precisa validar ${current.key_hint}`, cls: "text-amber-700 dark:text-amber-300" }
    : { label: "Não configurada", cls: "text-zinc-500 dark:text-zinc-400" };

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{info.name}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{info.purpose}</p>
        </div>
        <span className={`text-xs font-medium whitespace-nowrap ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
        {info.help}{" "}
        <a
          className="underline underline-offset-2"
          href={info.url}
          target="_blank"
          rel="noreferrer"
        >
          Abrir site
        </a>
      </p>
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="provider" value={provider} />
        <input
          name="api_key"
          type="password"
          autoComplete="off"
          placeholder={current ? "Colar nova chave para substituir" : "Colar chave de API"}
          className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? "Validando…" : "Salvar"}
        </button>
      </form>
      {state.provider === provider && state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.provider === provider && state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-300">Chave salva.</p>
      ) : null}
      {current ? (
        <form action={removeApiKeyAction}>
          <input type="hidden" name="provider" value={provider} />
          <button
            type="submit"
            className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400"
          >
            Remover chave
          </button>
        </form>
      ) : null}
    </article>
  );
}
