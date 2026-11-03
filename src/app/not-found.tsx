import Link from "next/link";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16">
      <p className="text-sm font-medium tracking-wide text-zinc-600 uppercase dark:text-zinc-400">
        Erro 404
      </p>
      <h1 className="text-2xl font-semibold">Esta página não existe</h1>
      <p className="text-zinc-700 dark:text-zinc-300">
        O endereço pode ter mudado, ou a passagem ou o monitor foi apagado.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/app"
          className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-2 text-sm font-medium text-white dark:text-zinc-950"
        >
          Ir para Passagens
        </Link>
        <Link href="/" className="px-1 py-2 text-sm underline underline-offset-4">
          Página inicial
        </Link>
      </div>
    </main>
  );
}
