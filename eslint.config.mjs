import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { USOS_DA_CHAVE_DE_SERVICO } from "./scripts/chave-de-servico.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // P20: a chave de serviço do Supabase ignora as regras de acesso. Só os arquivos
  // da lista curta (scripts/chave-de-servico.mjs) podem importá-la.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: Object.keys(USOS_DA_CHAVE_DE_SERVICO),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/supabase/admin", "**/supabase/admin"],
              message:
                "A chave de serviço ignora as regras de acesso. Use o cliente da pessoa (@/lib/supabase/server) ou uma função de um arquivo da lista curta (scripts/chave-de-servico.mjs) que filtre pelo id da sessão.",
            },
          ],
        },
      ],
    },
  },
  // P23: o supabase-js devolve o erro em vez de lançar. Gravação (insert, update,
  // upsert, delete) com o resultado descartado faz falha parecer sucesso.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ...[
          "ExpressionStatement > AwaitExpression > CallExpression",
          "ExpressionStatement > CallExpression:not([callee.name='exigir'])",
          "VariableDeclarator[id.type='ObjectPattern']:not(:has(ObjectPattern > Property[key.name='error'])) > AwaitExpression > CallExpression",
        ].map((onde) => ({
          selector: `${onde}:has(MemberExpression[property.name='from']):has(MemberExpression[property.name=/^(insert|update|upsert|delete)$/])`,
          message:
            "Gravação no banco com o erro ignorado: envolva em exigir(await …, 'contexto') (@/lib/supabase/exigir) ou leia `error` e trate.",
        })),
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
