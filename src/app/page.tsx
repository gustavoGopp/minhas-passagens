import Link from "next/link";

const features = [
  {
    title: "Minhas passagens",
    text: "Registre compras por e-mail encaminhado, texto colado, print ou manualmente. Próximo voo em destaque e avisos de check-in, conflito, trecho faltando e compra duplicada.",
  },
  {
    title: "Monitor de preços",
    text: "Defina rotas, período e preço-alvo. O app consulta periodicamente e avisa por Telegram, push ou e-mail quando o preço chega lá ou perto.",
  },
  {
    title: "Feriados",
    text: "Nacionais, estaduais, municipais e religiosos que você escolher, destacados perto das suas viagens e datas monitoradas.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-12 sm:py-20">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Em construção
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Minhas Passagens</h1>
        <p className="text-lg leading-7 text-zinc-600 dark:text-zinc-400">
          Suas passagens, preços e feriados em um só lugar. Código aberto, planos gratuitos e chaves
          de API próprias de cada pessoa.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-1">
        {features.map((f) => (
          <article
            key={f.title}
            className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
          >
            <h2 className="text-base font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{f.text}</p>
          </article>
        ))}
      </section>

      <p>
        <Link
          href="/login"
          className="inline-block rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          Entrar com Google
        </Link>
      </p>

      <footer className="text-sm text-zinc-500 dark:text-zinc-400">
        Acompanhe o andamento no{" "}
        <a
          className="font-medium text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
          href="https://github.com/gustavoGopp/minhas-passagens"
        >
          repositório no GitHub
        </a>
        .
      </footer>
    </main>
  );
}
