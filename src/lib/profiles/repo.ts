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
  holiday_city: z
    .string()
    .regex(/^[A-Z]{2}-[A-Z]+$/)
    .or(z.literal("")),
  show_optional_holidays: z.boolean(),
  show_christian_holidays: z.boolean(),
  show_jewish_holidays: z.boolean(),
  jewish_israel: z.boolean(),
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
  holiday_city: string | null;
  show_optional_holidays: boolean;
  show_christian_holidays: boolean;
  show_jewish_holidays: boolean;
  jewish_israel: boolean;
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
      // Cidade só vale se for da UF escolhida.
      holiday_city:
        input.holiday_city && input.uf && input.holiday_city.startsWith(`${input.uf}-`)
          ? input.holiday_city
          : null,
      show_optional_holidays: input.show_optional_holidays,
      show_christian_holidays: input.show_christian_holidays,
      show_jewish_holidays: input.show_jewish_holidays,
      jewish_israel: input.jewish_israel,
    })
    .eq("id", userId);
  if (error) throw new Error(`Falha ao salvar o perfil: ${error.message}`);
}

/** Converte o perfil nas preferências usadas por getHolidays(). */
export function holidayPreferences(profile: Profile | null) {
  return {
    uf: profile?.uf ?? null,
    city: profile?.holiday_city ?? null,
    showOptional: profile?.show_optional_holidays ?? true,
    showChristian: profile?.show_christian_holidays ?? false,
    showJewish: profile?.show_jewish_holidays ?? false,
    jewishIsrael: profile?.jewish_israel ?? false,
  };
}
