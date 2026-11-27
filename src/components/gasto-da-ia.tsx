import { getCurrentUser } from "@/lib/auth/current-user";
import { resumoDoGasto } from "@/lib/extract/consumo";
import { TETO_DIARIO_EXTRACOES } from "@/lib/extract/limites";
import { formatUsd } from "@/lib/mail/cost";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Gasto real da leitura com IA nos últimos 30 dias, ao lado do que a estimativa
 * diria para o mesmo número de leituras (P25). Lido pelo cliente da própria
 * pessoa: a tabela `extracoes` só mostra as linhas dela.
 */
export async function GastoDaIA() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const g = await resumoDoGasto(supabase, user.id);
  return (
    <section
      aria-label="Gasto com a leitura por IA"
      className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="font-semibold">Leitura com IA: gasto real</h2>
      {g.leituras === 0 ? (
        <p className="text-zinc-700 dark:text-zinc-300">Nenhuma leitura nos últimos 30 dias.</p>
      ) : (
        <p className="text-zinc-700 dark:text-zinc-300">
          Últimos 30 dias: {g.leituras} leitura(s)
          {g.comReforco ? `, ${g.comReforco} com o modelo de reforço` : ""}. Gasto real{" "}
          <strong>{formatUsd(g.realUsd)}</strong>; a estimativa para o mesmo número seria{" "}
          {formatUsd(g.estimadoUsd)}.
        </p>
      )}
      <p className="text-zinc-600 dark:text-zinc-400">
        Hoje: {g.hoje} de {TETO_DIARIO_EXTRACOES} leituras automáticas e envios de print, PDF ou
        texto. A busca completa que você confirma não entra nessa conta.
      </p>
    </section>
  );
}
