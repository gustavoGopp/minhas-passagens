import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Camada única de acesso à sessão (DAL). Lê cookies, então só pode ser chamada
 * dentro de um <Suspense> (Cache Components) ou em Server Actions/Route Handlers.
 * Redireciona para /login quando não há usuário.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  const user = await getOptionalUser();
  if (!user) redirect("/login");
  return user;
}

/** Igual a getCurrentUser, mas devolve null em vez de redirecionar. */
export async function getOptionalUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: user.id,
    email: user.email ?? null,
    name:
      typeof meta.full_name === "string"
        ? meta.full_name
        : typeof meta.name === "string"
          ? meta.name
          : null,
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
  };
}
