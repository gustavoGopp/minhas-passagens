// Partes puras do registro de falhas (P23): o texto guardado e o resumo que vai
// no e-mail do vigia diário. A gravação fica em src/lib/falhas.ts.

const LIMITE_MENSAGEM = 500;
const LIMITE_ORIGEM = 120;

function cortar(texto: string, limite: number): string {
  return texto.length <= limite ? texto : `${texto.slice(0, limite - 1)}…`;
}

/** E-mail vira "f***@dominio": o registro serve para diagnóstico, não para identificar alguém. */
function esconderEmails(texto: string): string {
  return texto.replace(
    /([A-Za-z0-9])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    "$1***@$2",
  );
}

/** Mensagem curta, de uma linha, a partir de qualquer coisa que tenha sido lançada. */
export function textoDaFalha(erro: unknown): string {
  let texto = "";
  if (typeof erro === "string") texto = erro;
  else if (erro && typeof erro === "object" && "message" in erro) {
    texto = String((erro as { message: unknown }).message ?? "");
    const digest = (erro as { digest?: unknown }).digest;
    if (texto && typeof digest === "string" && digest) texto = `${texto} (digest ${digest})`;
  }
  texto = esconderEmails(texto.replace(/\s+/g, " ").trim());
  return cortar(texto || "erro sem mensagem", LIMITE_MENSAGEM);
}

export function origemValida(origem: string): string {
  return cortar(origem.replace(/\s+/g, " ").trim() || "desconhecida", LIMITE_ORIGEM);
}

export interface LinhaDeFalha {
  origem: string;
  mensagem: string;
  criado_em: string;
}

const horaDeBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const diaDeBrasilia = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
});

/**
 * Resumo das falhas das últimas 24 horas para o e-mail do vigia diário.
 * Sem falha, devolve null e nenhum e-mail novo sai.
 */
export function resumoDasFalhas(linhas: LinhaDeFalha[], _now: string, appUrl: string) {
  if (!linhas.length) return null;
  const grupos = new Map<string, LinhaDeFalha[]>();
  for (const l of linhas) grupos.set(l.origem, [...(grupos.get(l.origem) ?? []), l]);
  const ordem = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
  const itens = ordem.map(([origem, ls]) => {
    const ultima = ls.reduce((a, b) => (Date.parse(b.criado_em) > Date.parse(a.criado_em) ? b : a));
    const quando = new Date(ultima.criado_em);
    return `- ${origem}: ${ls.length} ${ls.length === 1 ? "vez" : "vezes"}. A mais recente às ${horaDeBrasilia.format(quando)} de ${diaDeBrasilia.format(quando)}: ${ultima.mensagem}`;
  });
  const n = linhas.length;
  return {
    subject: `Minhas Passagens: ${n} ${n === 1 ? "falha" : "falhas"} nas últimas 24 horas`,
    text: [
      "O servidor registrou falhas desde o último vigia:",
      "",
      ...itens,
      "",
      "Se for algo que você nota no app, peça a uma sessão do Claude Code para investigar",
      "com o diagnóstico do banco (só leitura). Em caso grave, veja docs/EMERGENCIA.md.",
      appUrl ? appUrl : "",
    ]
      .filter((l, i, a) => l || a[i - 1])
      .join("\n"),
  };
}
