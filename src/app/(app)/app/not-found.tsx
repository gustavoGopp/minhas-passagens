import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col gap-3 py-8">
      <h1 className="text-xl font-semibold">Não encontramos isto</h1>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        A passagem ou o monitor pode ter sido apagado, ou o link está incompleto.
      </p>
      <Link href="/app" className="self-start text-sm underline underline-offset-4">
        Voltar para Passagens
      </Link>
    </main>
  );
}
