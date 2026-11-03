import Link from "next/link";
import { PilotRunner } from "./pilot-runner";

export const metadata = { title: "Piloto de preços" };

export default function PilotoPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app/monitor"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Preços
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Piloto: cobertura do Travelpayouts
        </h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Consulta SDU ↔ CGH nas suas janelas da ponte aérea, nos mercados “br” e padrão, e conta
          quantas datas-alvo voltam com preço. A API só devolve preços vistos por usuários do
          Aviasales nas últimas 48 horas. Abaixo de 80% de cobertura, o Travelpayouts não serve como
          fonte principal. Gratuito, usa o seu token.
        </p>
      </header>
      <PilotRunner />
    </main>
  );
}
