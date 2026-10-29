import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const UF_LIST = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

export const profileUpdateSchema = z.object({
  display_name: z.string().trim().max(80).optional().or(z.literal("")),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido"),
  uf: z.enum(UF_LIST).or(z.literal("")),
  quiet_hours_start: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  quiet_hours_end: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
  original_retention_days: z.coerce.number().int().min(0).max(365),
});

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  uf: string | null;
  city_ibge: string | null;
  quiet_hours_start: string;
  quiet_hours_end: string;
  original_retention_days: number;
  created_at: string;
  updated_at: string;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler o perfil: ${error.message}`);
  return data as Profile | null;
}

export async function updateProfile(userId: string, input: ProfileUpdate): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: input.display_name || null,
      timezone: input.timezone,
      uf: input.uf || null,
      quiet_hours_start: input.quiet_hours_start,
      quiet_hours_end: input.quiet_hours_end,
      original_retention_days: input.original_retention_days,
    })
    .eq("id", userId);
  if (error) throw new Error(`Falha ao salvar o perfil: ${error.message}`);
}
