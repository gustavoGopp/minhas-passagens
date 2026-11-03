"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { feedUrl, generateFeed, revokeFeed } from "@/lib/calendar/feed";
import { getRequestOrigin } from "@/lib/request-origin";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export interface FeedState {
  /** Link recém-gerado: só existe nesta resposta (o banco guarda o hash). */
  url?: string;
  error?: string;
  off?: boolean;
}

/** "gerar" cria ou troca o link (o antigo para na hora); "desligar" apaga. */
export async function feedAction(_prev: FeedState, formData: FormData): Promise<FeedState> {
  const user = await getCurrentUser();
  const intent = formData.get("intent");
  const admin = createSupabaseAdminClient();
  try {
    if (intent === "desligar") {
      await revokeFeed(admin, user.id);
      revalidatePath("/app/calendario/assinar");
      return { off: true };
    }
    if (intent !== "gerar") return { error: "Ação desconhecida." };
    const token = await generateFeed(admin, user.id, new Date().toISOString());
    revalidatePath("/app/calendario/assinar");
    return { url: feedUrl(await getRequestOrigin(), token) };
  } catch {
    return { error: "Não foi possível salvar. Tente de novo." };
  }
}
