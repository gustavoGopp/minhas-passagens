import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DeleteAccountForm } from "./delete-account-form";

export const metadata = { title: "Conta" };

export default function ContaPage() {
  return (
    <main className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold tracking-tight">Mais</h1>
      <Suspense fallback={null}>
        <AccountSummary />
      </Suspense>
      <nav className="flex flex-col divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        <Link className="px-4 py-3 text-sm" href="/app/perfil">
          Perfil e preferências
        </Link>
        <Link className="px-4 py-3 text-sm" href="/app/integracoes">
          Integrações (chaves de API)
        </Link>
        <a className="px-4 py-3 text-sm" href="/api/conta/exportar">
          Exportar meus dados (JSON)
        </a>
        <form action="/auth/sair" method="post">
          <button className="w-full px-4 py-3 text-left text-sm" type="submit">
            Sair
          </button>
        </form>
      </nav>
      <section className="flex flex-col gap-3 rounded-xl border border-red-200 p-4 dark:border-red-900">
        <h2 className="font-semibold text-red-800 dark:text-red-200">Apagar conta</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Remove sua conta e todos os dados (passagens, monitores, chaves). Não há como desfazer.
          Exporte antes, se quiser guardar.
        </p>
        <DeleteAccountForm />
      </section>
    </main>
  );
}

async function AccountSummary() {
  const user = await getCurrentUser();
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      Conectado como{" "}
      <span className="font-medium text-zinc-900 dark:text-zinc-100">{user.email}</span>
    </p>
  );
}
