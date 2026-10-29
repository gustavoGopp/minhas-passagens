import Link from "next/link";
import { Suspense } from "react";
import { signInWithGoogle } from "./actions";

export const metadata = { title: "Entrar" };

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Use sua conta Google. Não pedimos acesso ao seu e-mail: só nome e endereço para
          identificar a conta.
        </p>
      </header>
      <Suspense fallback={null}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        <Link className="underline underline-offset-4" href="/">
          Voltar para a página inicial
        </Link>
      </p>
    </main>
  );
}

async function LoginForm({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; erro?: string }>;
}) {
  const params = await searchParams;
  return (
    <form action={signInWithGoogle} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={params.next ?? "/app"} />
      {params.erro ? (
        <p
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          Não foi possível entrar: {params.erro}
        </p>
      ) : null}
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Entrar com Google
      </button>
    </form>
  );
}
