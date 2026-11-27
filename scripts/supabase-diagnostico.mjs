// Diagnóstico sem dados pessoais e sem gravar nada. Uso:
//   node scripts/supabase-diagnostico.mjs <arquivo.sql em supabase/diagnostics | auth-logs | auth-config>
// As consultas rodam em modo somente leitura e a saída passa pela trava de
// dado pessoal antes de ser impressa (os logs do Actions são públicos).
import { readFileSync } from "node:fs";
import path from "node:path";
import { authErrors, getAuthConfig, queryReadOnly } from "./supabase-api.mjs";
import { imprimirSeguro, problemasDeDadoPessoal } from "./supabase-diagnostico-lib.mjs";

const arg = process.argv[2] ?? "estado-schema.sql";

if (arg === "auth-logs") {
  const errors = await authErrors(Number(process.env.HOURS ?? 24));
  const limpos = errors.filter((e) => problemasDeDadoPessoal(e).length === 0);
  imprimirSeguro({ erros: limpos, omitidos_por_dado_pessoal: errors.length - limpos.length });
} else if (arg === "auth-config") {
  const c = await getAuthConfig();
  imprimirSeguro({
    site_url: c.site_url,
    uri_allow_list: c.uri_allow_list,
    external_google_enabled: c.external_google_enabled,
    external_google_client_id_set: Boolean(c.external_google_client_id),
    external_google_secret_set: Boolean(c.external_google_secret),
    disable_signup: c.disable_signup,
  });
} else {
  if (!/^[\w-]+\.sql$/.test(arg)) throw new Error("Use um arquivo .sql de supabase/diagnostics");
  const sql = readFileSync(
    path.join(import.meta.dirname, "..", "supabase", "diagnostics", arg),
    "utf8",
  );
  imprimirSeguro(await queryReadOnly(sql));
}
