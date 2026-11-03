/** Esqueleto enquanto a tela carrega (mesma silhueta do cartão do próximo voo e da lista). */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-8 w-40 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-44 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        ))}
      </div>
    </div>
  );
}
