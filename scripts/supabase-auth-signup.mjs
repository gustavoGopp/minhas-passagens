// Abre ou fecha o cadastro de contas novas no Auth do Supabase. Quem já tem
// conta continua entrando. Uso:
//   CADASTRO=fechado node scripts/supabase-auth-signup.mjs   (ou CADASTRO=aberto)
// O log mostra só o valor de disable_signup (os logs do Actions são públicos).
import { getAuthConfig, patchAuthConfig } from "./supabase-api.mjs";

const mode = process.env.CADASTRO;
if (mode !== "aberto" && mode !== "fechado") throw new Error("Use CADASTRO=aberto ou fechado");
await patchAuthConfig({ disable_signup: mode === "fechado" });
const after = await getAuthConfig();
console.log(JSON.stringify({ disable_signup: after.disable_signup }, null, 2));
