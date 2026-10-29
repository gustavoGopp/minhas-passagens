import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfile, UF_LIST } from "@/lib/profiles/repo";
import { ProfileForm } from "./profile-form";

export const metadata = { title: "Perfil" };

export default function PerfilPage() {
  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Perfil</h1>
      <Suspense fallback={<p className="text-sm text-zinc-500">Carregando…</p>}>
        <ProfileLoader />
      </Suspense>
    </main>
  );
}

async function ProfileLoader() {
  const user = await getCurrentUser();
  const profile = await getProfile(user.id);
  if (!profile) {
    return (
      <p className="text-sm text-red-700 dark:text-red-300">
        Perfil não encontrado. Verifique se a migração inicial foi aplicada no Supabase.
      </p>
    );
  }
  return <ProfileForm profile={profile} ufs={UF_LIST} />;
}
