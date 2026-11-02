// Ajusta Site URL e Redirect URLs do Auth. Uso:
//   SITE_URL=https://minhas-passagens.vercel.app REDIRECTS="https://a/**,https://b/**" node scripts/supabase-auth-urls.mjs
import { getAuthConfig, patchAuthConfig } from "./supabase-api.mjs";

const site = process.env.SITE_URL;
const redirects = (process.env.REDIRECTS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
if (!site) throw new Error("Informe SITE_URL");
const current = await getAuthConfig();
const merged = [
  ...new Set([
    ...(current.uri_allow_list ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...redirects,
  ]),
];
await patchAuthConfig({ site_url: site, uri_allow_list: merged.join(",") });
const after = await getAuthConfig();
console.log(
  JSON.stringify({ site_url: after.site_url, uri_allow_list: after.uri_allow_list }, null, 2),
);
