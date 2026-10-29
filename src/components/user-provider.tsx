"use client";
import { createContext, use, type ReactNode } from "react";
import type { CurrentUser } from "@/lib/auth/current-user";

const UserContext = createContext<Promise<CurrentUser> | null>(null);

export function UserProvider({
  userPromise,
  children,
}: {
  userPromise: Promise<CurrentUser>;
  children: ReactNode;
}) {
  return <UserContext value={userPromise}>{children}</UserContext>;
}

/** Usa a sessão lida no servidor. Chame só dentro de um <Suspense>. */
export function useUser(): CurrentUser {
  const promise = use(UserContext);
  if (!promise) throw new Error("useUser precisa estar dentro de UserProvider");
  return use(promise);
}
