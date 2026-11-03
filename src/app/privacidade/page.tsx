import Link from "next/link";

export const metadata = {
  title: "Política de Privacidade",
  description: "Como o Minhas Passagens usa, guarda e apaga os seus dados.",
};

const h2 = "text-lg font-semibold";
const p = "text-sm leading-6 text-zinc-700 dark:text-zinc-300";

/** Página pública exigida pelo Google para o acesso ao Gmail (OAuth). */
export default function PrivacidadePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Política de Privacidade</h1>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Atualizada em 3 de novembro de 2026.
      </p>

      <p className={p}>
        O Minhas Passagens é um app pessoal, de código aberto, que organiza passagens aéreas,
        acompanha preços de rotas e mostra feriados. Esta página explica quais dados ele usa e o que
        acontece com eles.
      </p>

      <h2 className={h2}>Login com Google</h2>
      <p className={p}>
        Para entrar, usamos o seu nome e o seu endereço de e-mail do Google, só para identificar a
        sua conta.
      </p>

      <h2 className={h2}>Gmail (opcional, só leitura)</h2>
      <p className={p}>
        Se você conectar o Gmail, o app pede permissão só de leitura (<code>gmail.readonly</code>).
        Ele não envia, apaga nem altera nada no seu e-mail. Ele procura apenas e-mails de companhias
        aéreas, agências e programas de milhas. Só lê o conteúdo dos que parecem passagens, extrai
        voo, horário, localizador e valor, e mostra tudo para você revisar antes de importar. O
        conteúdo do e-mail não é guardado. Ficam só os dados da passagem e, de cada e-mail lido, o
        identificador, a data, o domínio do remetente e o resultado da leitura.
      </p>
      <p className={p}>
        O uso e a transferência, para qualquer outro app, de informações recebidas das APIs do
        Google seguem a{" "}
        <a
          className="underline underline-offset-4"
          href="https://developers.google.com/terms/api-services-user-data-policy"
        >
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado. Os dados do Gmail não são usados para
        publicidade, não são vendidos e não são usados para treinar modelos de IA.
      </p>

      <h2 className={h2}>Leitura com IA</h2>
      <p className={p}>
        Para extrair os dados de um texto, print ou e-mail, o app envia esse conteúdo à API da
        Anthropic usando a chave de API da própria pessoa, que paga o uso na conta dela. O conteúdo
        não fica guardado no app depois da extração.
      </p>

      <h2 className={h2}>Onde ficam os dados</h2>
      <p className={p}>
        Os dados ficam num banco de dados Supabase, separados por usuário (Row Level Security). As
        chaves de API e o acesso ao Gmail ficam cifrados (AES-256-GCM) e nunca chegam ao navegador.
        Os avisos são enviados por e-mail (Resend), notificação no celular ou Telegram, conforme a
        sua escolha. Nenhum dado é vendido nem compartilhado com terceiros para outros fins.
      </p>

      <h2 className={h2}>Seus controles</h2>
      <p className={p}>
        Em Mais → Integrações você desconecta o Gmail, e o acesso é revogado no Google na hora.
        Também dá para revogar em myaccount.google.com → Segurança → Apps com acesso à sua conta. Em
        Mais → Conta você exporta todos os seus dados ou apaga a conta; apagar remove tudo e revoga
        o acesso ao Gmail.
      </p>

      <h2 className={h2}>Contato</h2>
      <p className={p}>
        Dúvidas sobre privacidade: abra uma issue em{" "}
        <a
          className="underline underline-offset-4"
          href="https://github.com/gustavoGopp/minhas-passagens/issues"
        >
          github.com/gustavoGopp/minhas-passagens
        </a>
        .
      </p>

      <Link className="text-sm underline underline-offset-4" href="/">
        Voltar para a página inicial
      </Link>
    </main>
  );
}
