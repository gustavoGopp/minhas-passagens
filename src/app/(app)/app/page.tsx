import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata = { title: "Passagens" };

export default function AppHome() {
  return (
    <main className="flex flex-col gap-6">
      <Suspense fallback={<h1 className="text-2xl font-semibold">Olá</h1>}>
        <Greeting />
      </Suspense>
      <section className="rounded-xl border border-dashed border-zinc-300 p-5 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        <h2 className="mb-1 font-medium text-zinc-900 dark:text-zinc-100">Próximo voo</h2>
        <p>Nenhuma passagem cadastrada ainda. O cadastro de passagens chega no marco M3.</p>
      </section>
    </main>
  );
}

async function Greeting() {
  const user = await getCurrentUser();
  const first = user.name?.split(" ")[0] ?? user.email ?? "";
  return <h1 className="text-2xl font-semibold tracking-tight">Olá{first ? `, ${first}` : ""}</h1>;
}
