"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getDecryptedKey } from "@/lib/integrations/repo";
import { runPilot, type PilotReport } from "@/lib/prices/pilot";
import {
  deleteMonitor,
  getMonitor,
  performCheck,
  saveMonitor,
  setMonitorActive,
} from "@/lib/prices/repo";
import { PONTE_AEREA } from "@/lib/prices/rule";
import { monitorInputSchema, type MonitorInput } from "@/lib/prices/schema";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseBRL } from "@/lib/trips/summary";

export interface MonitorFormState {
  ok?: boolean;
  error?: string;
  message?: string;
}

function refresh(id?: string) {
  revalidatePath("/app/monitor");
  if (id) revalidatePath(`/app/monitor/${id}`);
}

/** O formulário envia o monitor como JSON num campo oculto (regra com várias janelas). */
export async function saveMonitorAction(
  _prev: MonitorFormState,
  fd: FormData,
): Promise<MonitorFormState> {
  const user = await getCurrentUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return { error: "Dados inválidos" };
  }
  const parsed = monitorInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  const id = z
    .uuid()
    .or(z.literal(""))
    .parse(fd.get("id") ?? "");
  const profile = await getProfile(user.id);
  const savedId = await saveMonitor(
    user.id,
    parsed.data,
    profile?.timezone ?? "America/Sao_Paulo",
    id || undefined,
  );
  refresh(savedId);
  redirect(`/app/monitor/${savedId}`);
}

/** Atalho: cria os dois monitores da ponte aérea semanal com as janelas da entrevista. */
export async function createPonteAereaAction(
  _prev: MonitorFormState,
  fd: FormData,
): Promise<MonitorFormState> {
  const user = await getCurrentUser();
  const target = parseBRL(String(fd.get("target") ?? ""));
  if (!target) return { error: "Informe o preço-alvo por trecho." };
  const margin = parseBRL(String(fd.get("margin") ?? "")) ?? 0;
  const profile = await getProfile(user.id);
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const base: Omit<MonitorInput, "name" | "origin" | "destination" | "rule"> = {
    kind: "weekly",
    horizon_weeks: 8,
    target_cents: target,
    margin_cents: margin,
    margin_pct: null,
    airlines: ["AD", "G3", "LA"],
    allow_connections: false,
    max_duration_min: null,
    frequency: "daily",
    provider: "travelpayouts",
    active: true,
  };
  for (const [name, leg] of [
    ["Ponte aérea RJ → SP", PONTE_AEREA.rioSp],
    ["Ponte aérea SP → RJ", PONTE_AEREA.spRio],
  ] as const) {
    await saveMonitor(
      user.id,
      monitorInputSchema.parse({
        ...base,
        name,
        origin: leg.origin,
        destination: leg.destination,
        rule: leg.rule,
      }),
      tz,
    );
  }
  refresh();
  return {
    ok: true,
    message: "Dois monitores criados. A primeira checagem roda em até 5 minutos.",
  };
}

/** "Verificar agora": no máximo uma vez a cada 10 minutos por monitor. */
export async function checkNowAction(
  _prev: MonitorFormState,
  fd: FormData,
): Promise<MonitorFormState> {
  const user = await getCurrentUser();
  const id = z.uuid().parse(fd.get("id"));
  const monitor = await getMonitor(user.id, id);
  if (!monitor) return { error: "Monitor não encontrado." };
  if (monitor.last_checked_at && Date.now() - Date.parse(monitor.last_checked_at) < 10 * 60_000) {
    return { error: "Verificado há menos de 10 minutos. Tente daqui a pouco." };
  }
  const supabase = await createSupabaseServerClient();
  const r = await performCheck(supabase, monitor, await getProfile(user.id));
  refresh(id);
  if (!r.ok) return { error: r.error };
  const s = r.result.summary;
  return {
    ok: true,
    message: `${s.dates_matched} de ${s.target_dates} datas com preço nas suas janelas${
      r.result.alerts.length ? ` · ${r.result.alerts.length} aviso(s) na fila` : ""
    }.`,
  };
}

export async function deleteMonitorAction(fd: FormData) {
  const user = await getCurrentUser();
  await deleteMonitor(user.id, z.uuid().parse(fd.get("id")));
  refresh();
  redirect("/app/monitor");
}

export async function toggleMonitorAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = z.uuid().parse(fd.get("id"));
  await setMonitorActive(user.id, id, fd.get("active") === "true");
  refresh(id);
}

export interface PilotState {
  report?: PilotReport;
  error?: string;
}

/** Piloto: cobertura do Travelpayouts em SDU↔CGH nas próximas semanas (só leitura). */
export async function runPilotAction(_prev: PilotState, fd: FormData): Promise<PilotState> {
  const user = await getCurrentUser();
  const key = await getDecryptedKey(user.id, "travelpayouts");
  if (!key) return { error: "Cadastre o token do Travelpayouts em Mais → Integrações." };
  const weeks = z.coerce.number().int().min(1).max(12).catch(8).parse(fd.get("weeks"));
  const today = new Date().toISOString().slice(0, 10);
  try {
    return { report: await runPilot({ token: key, today, weeks }) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
