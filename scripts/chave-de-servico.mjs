// Lista curta dos arquivos que podem usar a chave de serviço do Supabase (P20).
// Essa chave ignora as regras de acesso por linha: quem a usa responde, sozinho,
// por filtrar cada consulta pela pessoa certa. Fora desta lista, o lint
// (eslint.config.mjs) recusa o import e o teste scripts/chave-de-servico.test.mjs falha.
//
// Para pôr um arquivo novo aqui: dizer no PR por que o cliente da própria pessoa
// não serve, e pedir a revisão em sessão limpa (.claude/skills/revisao-limpa).
export const USOS_DA_CHAVE_DE_SERVICO = {
  // Sem sessão de pessoa: agendador, vigia diário e webhook do Telegram.
  "src/lib/jobs/tick.ts": "agendador: percorre todas as contas",
  "src/app/api/jobs/watchdog/route.ts": "vigia diário: avisa o dono",
  "src/app/api/telegram/webhook/route.ts": "webhook do Telegram: vincula pelo código",
  "src/lib/notify/config.ts": "configuração do servidor (app_config), sem dono",
  "src/lib/notify/dispatch.ts": "entrega de avisos pelo agendador",
  "src/lib/falhas.ts": "registro de falhas: tabela só do servidor",
  // Tabelas que só o servidor grava (docs/regras-de-acesso.md), sempre filtradas pela pessoa.
  "src/lib/mail/accounts.ts": "conexão do Gmail",
  "src/lib/mail/importacao.ts": "busca e importação do Gmail",
  "src/lib/notify/acoes.ts": "vínculo do Telegram e aviso de teste",
  "src/lib/prices/verificar-agora.ts": "histórico de preço pelo botão Verificar agora",
  "src/lib/extract/consumo.ts": "consumo e teto da leitura com IA (inclusive no envio de print)",
  // A chave cifrada só é lida pelo servidor.
  "src/lib/integrations/repo.ts": "leitura da chave de API cifrada",
  // A API de Auth só aceita a chave de serviço.
  "src/lib/account/apagar.ts": "apagar a conta",
};
