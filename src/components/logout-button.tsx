"use client";
import { clearOfflineData } from "./offline-sync";

/** "Sair": apaga do aparelho os voos guardados para o modo offline e encerra a sessão. */
export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action="/auth/sair" method="post" onSubmit={() => clearOfflineData()}>
      <button className={className} type="submit">
        Sair
      </button>
    </form>
  );
}
