import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { planLegChanges, type BookingRow, type FlightRow, type rowsFromDraft } from "./draft";

type Rows = ReturnType<typeof rowsFromDraft>;

const BOOKING_COLS =
  "id, locator, airline, seller, channel, amount_cents, currency, miles, taxes_cents, purchased_on, tag, status, source, notes";
const FLIGHT_COLS =
  "id, booking_id, airline, flight_number, origin, destination, departs_at, arrives_at, passenger, checkin_done, ignore_missing_leg";

export async function listTrips(
  userId: string,
): Promise<{ bookings: BookingRow[]; flights: FlightRow[] }> {
  const supabase = await createSupabaseServerClient();
  const [b, f] = await Promise.all([
    supabase.from("bookings").select(BOOKING_COLS).eq("user_id", userId),
    supabase.from("flights").select(FLIGHT_COLS).eq("user_id", userId).order("departs_at"),
  ]);
  if (b.error) throw new Error(`Falha ao ler passagens: ${b.error.message}`);
  if (f.error) throw new Error(`Falha ao ler trechos: ${f.error.message}`);
  return { bookings: (b.data ?? []) as BookingRow[], flights: (f.data ?? []) as FlightRow[] };
}

export async function getTrip(userId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const [b, f] = await Promise.all([
    supabase.from("bookings").select(BOOKING_COLS).eq("user_id", userId).eq("id", id).maybeSingle(),
    supabase
      .from("flights")
      .select(FLIGHT_COLS)
      .eq("user_id", userId)
      .eq("booking_id", id)
      .order("departs_at"),
  ]);
  if (b.error) throw new Error(`Falha ao ler a passagem: ${b.error.message}`);
  if (f.error) throw new Error(`Falha ao ler trechos: ${f.error.message}`);
  if (!b.data) return null;
  return { booking: b.data as BookingRow, flights: (f.data ?? []) as FlightRow[] };
}

export async function createTrip(userId: string, rows: Rows): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .insert({ ...rows.booking, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao salvar a passagem: ${error.message}`);
  const id = data.id as string;
  const ins = await supabase.from("flights").insert(
    planLegChanges([], rows.flights).insert.map((f) => ({
      ...f,
      booking_id: id,
      user_id: userId,
    })),
  );
  if (ins.error) {
    await supabase.from("bookings").delete().eq("id", id).eq("user_id", userId);
    throw new Error(`Falha ao salvar os trechos: ${ins.error.message}`);
  }
  return id;
}

export async function updateTrip(userId: string, id: string, rows: Rows): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const up = await supabase
    .from("bookings")
    .update(rows.booking)
    .eq("id", id)
    .eq("user_id", userId);
  if (up.error) throw new Error(`Falha ao atualizar a passagem: ${up.error.message}`);

  const cur = await supabase
    .from("flights")
    .select("id, departs_at, flight_number, origin")
    .eq("booking_id", id)
    .eq("user_id", userId);
  if (cur.error) throw new Error(`Falha ao ler trechos: ${cur.error.message}`);
  const plan = planLegChanges((cur.data ?? []) as FlightRow[], rows.flights);

  // Ordem segura sem transação: atualiza e insere antes de apagar, para a
  // passagem nunca ficar sem trechos se algo falhar no meio.
  for (const u of plan.update) {
    const r = await supabase.from("flights").update(u.fields).eq("id", u.id).eq("user_id", userId);
    if (r.error) throw new Error(`Falha ao atualizar trechos: ${r.error.message}`);
  }
  if (plan.insert.length) {
    const ins = await supabase
      .from("flights")
      .insert(plan.insert.map((f) => ({ ...f, booking_id: id, user_id: userId })));
    if (ins.error) throw new Error(`Falha ao atualizar trechos: ${ins.error.message}`);
  }
  if (plan.remove.length) {
    const del = await supabase.from("flights").delete().in("id", plan.remove).eq("user_id", userId);
    if (del.error) throw new Error(`Falha ao atualizar trechos: ${del.error.message}`);
  }
}

export async function setTripStatus(userId: string, id: string, status: BookingRow["status"]) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao mudar o status: ${error.message}`);
}

export async function deleteTrip(userId: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("bookings").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(`Falha ao apagar: ${error.message}`);
}

export async function setCheckin(userId: string, flightId: string, done: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("flights")
    .update({ checkin_done: done })
    .eq("id", flightId)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao marcar check-in: ${error.message}`);
}

/** "Cheguei por outro meio": silencia o alerta de trecho faltando antes deste voo. */
export async function setIgnoreMissingLeg(userId: string, flightId: string, value: boolean) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("flights")
    .update({ ignore_missing_leg: value })
    .eq("id", flightId)
    .eq("user_id", userId);
  if (error) throw new Error(`Falha ao atualizar o trecho: ${error.message}`);
}
