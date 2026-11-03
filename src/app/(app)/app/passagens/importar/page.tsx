import Link from "next/link";
import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listIntegrationsPublic } from "@/lib/integrations/repo";
import { getMailAccount, googleClient } from "@/lib/mail/accounts";
import { estimateUsd, formatUsd } from "@/lib/mail/cost";
import { decideCandidates, type Candidate } from "@/lib/mail/dedupe";
import { gmailLink } from "@/lib/mail/gmail";
import { latestScan, RUNNING_STATUSES, scanCounts } from "@/lib/mail/scan";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { airlineName } from "@/lib/trips/airlines";
import type { BookingDraft } from "@/lib/trips/draft";
import { listTrips } from "@/lib/trips/repo";
import {
  cancelScanAction,
  confirmScanAction,
  dismissPendingAction,
  startScanAction,
} from "./actions";
import { ImportForm, type CandidateView } from "./import-form";
import { ScanRunner } from "./scan-runner";

export const metadata = { title: "Importar do Gmail" };
// As ações desta tela avançam a varredura por até ~40 s por chamada.
export const maxDuration = 60;

const card = "flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800";
const primary =
  "self-start rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900";

export default function ImportarPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Passagens
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Importar do Gmail</h1>
        <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          Procura no seu Gmail (inclusive arquivados, spam e lixeira) os e-mails de companhias e
          agências, lê só os que parecem passagens e mostra tudo aqui para você conferir antes de
          importar. O e-mail em si não fica guardado.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}>
        <ImportState />
      </Suspense>
    </main>
  );
}

const ddmmyyyy = (iso: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

function view(
  c: Candidate & { messageId: string | null },
  kind: CandidateView["kind"],
): CandidateView {
  const d: BookingDraft = c.draft;
  const route = d.legs.map((l) => `${l.origin} → ${l.destination}`).join(" · ");
  const first = d.legs[0];
  const when = first
    ? `${first.departure_local.slice(8, 10)}/${first.departure_local.slice(5, 7)}/${first.departure_local.slice(0, 4)} ${first.departure_local.slice(11, 16)}`
    : "";
  const price = d.amount ? `R$ ${d.amount}` : d.miles ? `${d.miles} milhas` : null;
  return {
    id: c.id,
    kind,
    title: `${route} · ${airlineName(d.airline)}`,
    detail: [
      when,
      d.locator ? `localizador ${d.locator}` : null,
      price,
      d.status === "cancelled" ? "cancelada" : null,
    ]
      .filter(Boolean)
      .join(" · "),
    receivedOn: ddmmyyyy(c.receivedAt),
    gmailUrl: c.messageId ? gmailLink(c.messageId) : null,
  };
}

async function ImportState() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const [account, integrations, scan, pending] = await Promise.all([
    getMailAccount(user.id),
    listIntegrationsPublic(user.id),
    latestScan(supabase, user.id),
    supabase
      .from("import_candidates")
      .select("id, received_at, draft, mail_messages(provider_message_id)")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .order("received_at", { ascending: false }),
  ]);
  const hasAnthropic = integrations.some((i) => i.provider === "anthropic");
  const candidates = (pending.data ?? []).map((c) => ({
    id: c.id as string,
    receivedAt: (c.received_at as string) ?? "",
    draft: c.draft as BookingDraft,
    messageId:
      (c.mail_messages as unknown as { provider_message_id: string } | null)?.provider_message_id ??
      null,
  }));

  if (!googleClient() || !account || account.status !== "active") {
    return (
      <section className={card}>
        <h2 className="font-semibold">
          {account?.status === "expired" ? "O acesso ao Gmail expirou" : "Conecte o Gmail primeiro"}
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          A conexão é só de leitura e você pode desconectar quando quiser.
        </p>
        <Link className={primary} href="/app/integracoes">
          {account ? "Reconectar em Integrações" : "Ir para Integrações"}
        </Link>
      </section>
    );
  }

  const running = scan && RUNNING_STATUSES.includes(scan.status);
  const counts = scan ? await scanCounts(supabase, scan.id) : null;

  return (
    <>
      {!hasAnthropic ? (
        <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">
          Para ler as passagens com IA, cadastre sua chave da Anthropic em{" "}
          <Link className="underline underline-offset-4" href="/app/integracoes">
            Integrações
          </Link>
          . A busca e o filtro funcionam sem ela.
        </p>
      ) : null}

      {running ? (
        <section className={card}>
          <ScanRunner initial={scan.status} />
          <form action={cancelScanAction}>
            <button type="submit" className="text-sm underline underline-offset-4">
              Cancelar a varredura
            </button>
          </form>
        </section>
      ) : scan?.status === "awaiting_confirmation" ? (
        <section className={card}>
          <h2 className="font-semibold">
            {counts?.candidate ?? 0} e-mail(s) parecem passagens (de {counts?.total ?? 0} de viagem)
          </h2>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Ler esses e-mails com IA custa até cerca de{" "}
            <strong>{formatUsd(estimateUsd(counts?.candidate ?? 0))}</strong>, cobrados na sua chave
            da Anthropic. Propaganda e newsletters já ficaram de fora, sem custo.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <form action={confirmScanAction} className="flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="checkbox" name="auto_sync" defaultChecked className="mt-1" />
                <span>
                  Depois, ler sozinho os e-mails novos de viagem (a cada 30 min, centavos por mês na
                  sua chave). Dá para desligar em Integrações.
                </span>
              </label>
              <button type="submit" className={primary} disabled={!hasAnthropic}>
                Confirmar e ler com IA
              </button>
            </form>
            <form action={cancelScanAction}>
              <button type="submit" className="text-sm underline underline-offset-4">
                Cancelar
              </button>
            </form>
          </div>
        </section>
      ) : candidates.length === 0 ? (
        <section className={card}>
          {scan?.status === "review" ? (
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              Última varredura concluída em {ddmmyyyy(scan.finished_at)}: nada novo para importar.
            </p>
          ) : scan?.status === "error" ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              A última varredura parou: {scan.last_error}
            </p>
          ) : null}
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Primeiro o app só procura e separa (grátis). Antes de ler com IA, mostra quantos e-mails
            são e quanto custa, e espera você confirmar.
          </p>
          <form action={startScanAction}>
            <button type="submit" className={primary}>
              Procurar passagens no meu Gmail
            </button>
          </form>
        </section>
      ) : null}

      {candidates.length ? <Review userId={user.id} candidates={candidates} /> : null}
    </>
  );
}

async function Review({
  userId,
  candidates,
}: {
  userId: string;
  candidates: (Candidate & { messageId: string | null })[];
}) {
  const trips = await listTrips(userId);
  const decisions = decideCandidates({ candidates, ...trips });
  const kindOf = new Map(decisions.map((d) => [d.id, d.kind]));
  const items = candidates.map((c) => view(c, kindOf.get(c.id) ?? "new"));
  const count = (k: CandidateView["kind"]) => items.filter((i) => i.kind === k).length;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">
        Encontramos {items.length} passagem(ns): {count("new")} nova(s), {count("update")}{" "}
        remarcação(ões), {count("cancel")} cancelamento(s) e {count("duplicate")} já cadastrada(s)
      </h2>
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        Confira e desmarque o que não quiser. As já cadastradas vêm desmarcadas.
      </p>
      <ImportForm items={items} />
      <form action={dismissPendingAction}>
        <button type="submit" className="text-sm underline underline-offset-4">
          Descartar todas as que sobraram
        </button>
      </form>
    </section>
  );
}
