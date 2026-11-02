// Cliente mínimo da Management API do Supabase, usado pelos workflows do GitHub Actions.
// Requer SUPABASE_ACCESS_TOKEN (segredo do repositório) e SUPABASE_PROJECT_REF.
//
// ATENÇÃO: o repositório é público e os logs do Actions também. Nada que saia
// daqui pode conter dados pessoais (e-mails, nomes, tokens, chaves).

const API = "https://api.supabase.com/v1";

export function config() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF;
  if (!token) throw new Error("Defina o segredo SUPABASE_ACCESS_TOKEN no repositório.");
  if (!ref) throw new Error("Defina SUPABASE_PROJECT_REF.");
  return { token, ref };
}

async function call(method, path, body) {
  const { token } = config();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

/** Executa SQL como dono do banco e devolve as linhas do último comando. */
export async function query(sql) {
  const { ref } = config();
  return call("POST", `/projects/${ref}/database/query`, { query: sql });
}

export async function getAuthConfig() {
  const { ref } = config();
  return call("GET", `/projects/${ref}/config/auth`);
}

export async function patchAuthConfig(patch) {
  const { ref } = config();
  return call("PATCH", `/projects/${ref}/config/auth`, patch);
}

/** Logs do Auth no intervalo, só com campos técnicos (sem e-mail, IP ou tokens). */
export async function authErrors(hours = 24) {
  const { ref } = config();
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const sql = "select timestamp, event_message from auth_logs order by timestamp desc limit 200";
  const params = new URLSearchParams({
    sql,
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  const data = await call("GET", `/projects/${ref}/analytics/endpoints/logs.all?${params}`);
  const rows = data?.result ?? [];
  const SAFE = [
    "level",
    "msg",
    "error",
    "error_code",
    "status",
    "path",
    "method",
    "component",
    "provider",
    "grant_type",
  ];
  return rows
    .map((r) => {
      let ev = {};
      try {
        ev = JSON.parse(r.event_message);
      } catch {
        ev = { msg: String(r.event_message).slice(0, 200) };
      }
      const safe = Object.fromEntries(
        SAFE.filter((k) => ev[k] !== undefined).map((k) => [k, ev[k]]),
      );
      return { at: new Date(Number(r.timestamp) / 1000).toISOString(), ...safe };
    })
    .filter((e) => e.level === "error" || e.error || (e.status && Number(e.status) >= 400));
}
