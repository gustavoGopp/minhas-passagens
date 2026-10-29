"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { parseAuthHash } from "@/lib/auth/parse-auth-hash";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/** Mostra o erro real do Supabase (que chega no #fragmento) ou conclui o fluxo implícito. */
export function HashError() {
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const parsed = parseAuthHash(window.location.hash);
    if (parsed.type === "none") return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
    if (parsed.type === "error") {
      // Atualiza fora do corpo do efeito (o hash é um sistema externo).
      void Promise.resolve().then(() => setMessage(parsed.message));
      return;
    }
    const supabase = createSupabaseBrowserClient();
    supabase.auth
      .setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken })
      .then(({ error }) => {
        if (error) setMessage(error.message);
        else router.replace("/app");
      });
  }, [router]);

  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      Detalhe do erro: {message}
    </p>
  );
}
