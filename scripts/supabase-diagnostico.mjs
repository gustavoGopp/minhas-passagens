// Diagnóstico sem dados pessoais. Uso:
//   node scripts/supabase-diagnostico.mjs <arquivo.sql em supabase/diagnostics | auth-logs | auth-config>
import { readFileSync } from "node:fs";
import path from "node:path";
import { authErrors, getAuthConfig, query } from "./supabase-api.mjs";

const arg = process.argv[2] ?? "estado-schema.sql";

if (arg === "auth-logs") {
  const errors = await authErrors(Number(process.env.HOURS ?? 24));
  console.log(JSON.stringify(errors, null, 2));
} else if (arg === "auth-config") {
  const c = await getAuthConfig();
  console.log(
    JSON.stringify(
      {
        site_url: c.site_url,
        uri_allow_list: c.uri_allow_list,
        external_google_enabled: c.external_google_enabled,
        external_google_client_id_set: Boolean(c.external_google_client_id),
        external_google_secret_set: Boolean(c.external_google_secret),
        disable_signup: c.disable_signup,
      },
      null,
      2,
    ),
  );
} else {
  if (!/^[\w-]+\.sql$/.test(arg)) throw new Error("Use um arquivo .sql de supabase/diagnostics");
  const sql = readFileSync(
    path.join(import.meta.dirname, "..", "supabase", "diagnostics", arg),
    "utf8",
  );
  console.log(JSON.stringify(await query(sql), null, 2));
}
