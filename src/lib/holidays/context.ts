import "server-only";
import { listMonitors, type MonitorRow } from "@/lib/prices/repo";
import { upcomingLongWeekends, type LongWeekend } from "@/lib/prices/rule";
import { getProfile, holidayPreferences, type Profile } from "@/lib/profiles/repo";
import { utcToLocal } from "@/lib/trips/time";
import { LONG_WEEKEND_WEEKS } from "@/lib/notify/holiday-events";
import { holidaysAround, type HolidayEvent } from "./index";
import { listOverrides } from "./repo";

export interface LongWeekendItem {
  lw: LongWeekend;
  /** Monitores já criados para este feriadão (ida e volta). */
  monitors: Pick<MonitorRow, "id" | "name">[];
}

export interface HolidayContext {
  profile: Profile | null;
  /** Data local do usuário. */
  today: string;
  holidays: HolidayEvent[];
  longWeekends: LongWeekendItem[];
}

/** Feriados do usuário (perfil + ajustes) e os próximos feriadões com seus monitores. */
export async function loadHolidayContext(
  userId: string,
  weeks = LONG_WEEKEND_WEEKS,
): Promise<HolidayContext> {
  const [profile, overrides, monitors] = await Promise.all([
    getProfile(userId),
    listOverrides(userId),
    listMonitors(userId),
  ]);
  const today = utcToLocal(
    new Date().toISOString(),
    profile?.timezone ?? "America/Sao_Paulo",
  ).slice(0, 10);
  const holidays = holidaysAround(today, holidayPreferences(profile), overrides);
  const longWeekends = upcomingLongWeekends(holidays, today, weeks).map((lw) => ({
    lw,
    monitors: monitors
      .filter((m) => m.long_weekend === lw.start)
      .map((m) => ({ id: m.id, name: m.name })),
  }));
  return { profile, today, holidays, longWeekends };
}
