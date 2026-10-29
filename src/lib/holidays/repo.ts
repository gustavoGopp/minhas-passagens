import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { HolidayKind, HolidayOverride } from "./index";

export interface StoredOverride extends HolidayOverride {
  id: string;
}

export async function listOverrides(userId: string): Promise<StoredOverride[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("holiday_overrides")
    .select("id, action, date, event_key, name, kind")
    .eq("user_id", userId)
    .order("date");
  if (error) throw new Error(`Falha ao ler ajustes do calendário: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    action: r.action as "add" | "hide",
    date: r.date as string,
    key: (r.event_key as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    kind: (r.kind as HolidayKind | null) ?? null,
  }));
}

export async function addOverride(
  userId: string,
  o: {
    action: "add" | "hide";
    date: string;
    key?: string | null;
    name?: string | null;
    kind?: HolidayKind | null;
  },
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("holiday_overrides").insert({
    user_id: userId,
    action: o.action,
    date: o.date,
    event_key: o.key ?? null,
    name: o.name ?? null,
    kind: o.kind ?? null,
  });
  if (error) throw new Error(`Falha ao salvar ajuste: ${error.message}`);
}

export async function removeOverride(userId: string, id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("holiday_overrides")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(`Falha ao remover ajuste: ${error.message}`);
}
