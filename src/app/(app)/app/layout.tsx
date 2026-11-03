import { Suspense, type ReactNode } from "react";
import { AppNav, NavList } from "@/components/app-nav";
import { UserProvider } from "@/components/user-provider";
import { getCurrentUser } from "@/lib/auth/current-user";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <Suspense fallback={<NavList pathname={null} />}>
        <AppNav />
      </Suspense>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 pt-6 pb-24 sm:pb-10">
        <Suspense
          fallback={
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando sua conta…</p>
          }
        >
          <UserGate>{children}</UserGate>
        </Suspense>
      </div>
    </div>
  );
}

/** Lê a sessão atrás do Suspense (exigência do Cache Components) e redireciona se não houver. */
async function UserGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  return <UserProvider userPromise={Promise.resolve(user)}>{children}</UserProvider>;
}
