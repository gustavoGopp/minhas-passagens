import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getMailAccount, googleClient } from "@/lib/mail/accounts";
import { disconnectGmailAction } from "./actions";

const card = "flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";

/** Mensagens da volta do consentimento do Google (?gmail=...). */
const RESULT: Record<string, { ok: boolean; text: string }> = {
  conectado: { ok: true, text: "Gmail conectado." },
  negado: { ok: false, text: "Você não autorizou o acesso no Google. Nada foi guardado." },
  escopo: {
    ok: false,
    text: "A permissão de leitura do Gmail ficou desmarcada na tela do Google. Tente de novo e deixe-a marcada.",
  },
  "sem-acesso-continuo": {
    ok: false,
    text: "O Google não liberou o acesso contínuo. Remova o app em myaccount.google.com → Segurança → Apps com acesso e conecte de novo.",
  },
  estado: { ok: false, text: "O link de volta expirou ou não é desta sessão. Tente de novo." },
  configurar: {
    ok: false,
    text: "Falta configurar o cliente OAuth do Google nesta instalação (GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET na Vercel).",
  },
  falha: {
    ok: false,
    text: "Não foi possível falar com o Google agora. Tente de novo em instantes.",
  },
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );

/** Cartão "Gmail": conectar (OAuth, só leitura), estado da conexão e desconectar. */
export async function GmailCard({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  const account = await getMailAccount(user.id);
  const configured = Boolean(googleClient());
  const result = params.gmail ? RESULT[params.gmail] : undefined;

  return (
    <section className={card} aria-labelledby="gmail-title">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="gmail-title" className="font-semibold">
            Gmail (encontrar passagens)
          </h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            O app procura no seu Gmail (inclusive arquivados, spam e lixeira) só e-mails de
            companhias aéreas e agências.
          </p>
        </div>
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          {account?.status === "active"
            ? "Conectado"
            : account?.status === "expired"
              ? "Acesso expirado"
              : "Não conectado"}
        </span>
      </div>

      {result ? (
        <p
          role={result.ok ? "status" : "alert"}
          className={`text-sm ${result.ok ? "text-green-700 dark:text-green-300" : "text-red-700 dark:text-red-300"}`}
        >
          {result.text}
        </p>
      ) : null}

      <ul className="list-disc pl-5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        <li>Permissão só de leitura: o app não envia, apaga nem altera nada.</li>
        <li>
          O conteúdo só é lido quando parece uma passagem, e é extraído com a sua chave da
          Anthropic. O e-mail em si não fica guardado; ficam só os dados da passagem.
        </li>
        <li>Você revisa tudo antes de importar e pode desconectar quando quiser.</li>
      </ul>

      {account ? (
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {account.email ? <strong>{account.email}</strong> : null} · conectado em{" "}
          {fmt(account.connected_at)}
          {account.last_refresh_ok_at
            ? ` · acesso confirmado em ${fmt(account.last_refresh_ok_at)}`
            : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {configured ? (
          account?.status !== "active" ? (
            // Link comum (não prefetch): a rota redireciona para o Google.
            <a
              href="/api/gmail/start"
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              {account ? "Reconectar o Gmail" : "Conectar o Gmail"}
            </a>
          ) : null
        ) : (
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Para ligar, o dono da instalação configura o cliente OAuth do Google (veja o README).
          </p>
        )}
        {account?.status === "active" ? (
          <Link
            href="/app/passagens/importar"
            className="text-sm font-medium underline underline-offset-4"
          >
            Procurar passagens no Gmail
          </Link>
        ) : null}
        {account ? (
          <form action={disconnectGmailAction}>
            <button type="submit" className="text-sm underline underline-offset-4">
              Desconectar e revogar o acesso
            </button>
          </form>
        ) : null}
      </div>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Também dá para revogar em myaccount.google.com → Segurança → Apps com acesso à sua conta.
      </p>
    </section>
  );
}
