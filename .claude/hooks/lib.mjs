// Utilitários dos hooks do Claude Code deste repositório.
// Cada hook lê um JSON da entrada padrão e, para bloquear, imprime a decisão
// no formato da documentação (hookSpecificOutput.permissionDecision).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function lerEntrada() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

/** Imprime a decisão de um hook PreToolUse. decisao: "deny" | "ask". */
export function decidir(decisao, motivo) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: decisao,
        permissionDecisionReason: motivo,
      },
    }),
  );
}

/** Verdadeiro quando o arquivo foi chamado direto (e não importado por um teste). */
export function chamadoDireto(metaUrl) {
  return Boolean(process.argv[1]) && pathToFileURL(process.argv[1]).href === metaUrl;
}
