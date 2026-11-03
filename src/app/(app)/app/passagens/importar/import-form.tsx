"use client";
import { useActionState } from "react";
import { importCandidatesAction, type ImportState } from "./actions";

export interface CandidateView {
  id: string;
  kind: "new" | "update" | "duplicate" | "cancel";
  title: string;
  detail: string;
  receivedOn: string;
  gmailUrl: string | null;
  /** Ano suspeito (voo antes do e-mail ou quase um ano depois). */
  warning: string | null;
}

const KIND: Record<CandidateView["kind"], string> = {
  new: "Nova",
  update: "Remarcação",
  cancel: "Cancelamento",
  duplicate: "Já cadastrada",
};

/** Revisão em lote: novas, remarcações e cancelamentos já vêm marcadas; duplicadas, não. */
export function ImportForm({ items }: { items: CandidateView[] }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(
    importCandidatesAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {items.map((c) => (
          <li key={c.id} className="flex items-start gap-3 px-4 py-3">
            <input
              id={`c-${c.id}`}
              type="checkbox"
              name="candidate"
              value={c.id}
              defaultChecked={c.kind !== "duplicate"}
              className="mt-1"
            />
            <label htmlFor={`c-${c.id}`} className="flex flex-1 flex-col gap-0.5 text-sm">
              <span className="font-medium">{c.title}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{c.detail}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">{KIND[c.kind]}</span> · e-mail de {c.receivedOn}
              </span>
              {c.warning ? (
                <span className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  ⚠ {c.warning}
                </span>
              ) : null}
            </label>
            {c.gmailUrl ? (
              <a
                className="text-xs underline underline-offset-2"
                href={c.gmailUrl}
                target="_blank"
                rel="noreferrer"
              >
                Abrir no Gmail
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {state.errors?.length ? (
        <div role="alert" className="text-sm text-red-700 dark:text-red-300">
          Não deu para importar: {state.errors.join("; ")}. Cadastre essas à mão em + Nova.
        </div>
      ) : null}
      {state.imported != null ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-300">
          {state.imported} nova(s), {state.updated} remarcação(ões) e {state.cancelled}{" "}
          cancelamento(s) importados.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand hover:bg-brand-strong dark:bg-brand-dark self-start rounded-xl px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
      >
        {pending ? "Importando…" : "Importar marcadas"}
      </button>
    </form>
  );
}
