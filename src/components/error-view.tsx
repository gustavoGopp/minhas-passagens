"use client";
import Link from "next/link";
import { useEffect } from "react";

/**
 * Tela de erro em pt-BR (error.tsx). Mostra o código do erro (digest) para cruzar
 * com o log do servidor, sem expor a mensagem técnica.
 */
export function ErrorView({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error
      ? String((error as { digest?: string }).digest)
      : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex flex-col gap-3 py-8" role="alert">
      <h1 className="text-xl font-semibold">Não conseguimos carregar esta tela</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Isso costuma passar em alguns segundos. Seus dados estão salvos.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-2 text-sm font-medium text-white dark:text-zinc-950"
        >
          Tentar de novo
        </button>
        <Link href="/app" className="text-sm underline underline-offset-4">
          Ir para Passagens
        </Link>
      </div>
      {digest ? (
        <p className="text-xs text-zinc-600 dark:text-zinc-400">Código do erro: {digest}</p>
      ) : null}
    </main>
  );
}
