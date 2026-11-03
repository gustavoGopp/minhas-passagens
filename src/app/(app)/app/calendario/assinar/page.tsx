import Link from "next/link";
import { Suspense } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProfile } from "@/lib/profiles/repo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatInZone } from "@/lib/trips/time";
import { FeedPanel } from "./feed-panel";

export const metadata = { title: "Calendário no celular" };

const GOOGLE_ADD_BY_URL = "https://calendar.google.com/calendar/u/0/r/settings/addbyurl";

export default function AssinarPage() {
  return (
    <main className="flex flex-col gap-6">
      <Link
        href="/app/calendario"
        className="text-sm text-zinc-600 underline underline-offset-4 dark:text-zinc-400"
      >
        ← Calendário
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Calendário no celular</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Um link para adicionar uma vez no Google Agenda ou no iPhone. Seus voos aparecem lá e se
          atualizam sozinhos: passagem nova entra, cancelada sai.
        </p>
      </header>

      <Card>
        <SectionTitle>Seu link</SectionTitle>
        <Suspense
          fallback={<p className="text-sm text-zinc-600 dark:text-zinc-400">Carregando…</p>}
        >
          <Status />
        </Suspense>
      </Card>

      <Card tone="warn">
        <h2 className="text-sm font-semibold">Cuidado com o link</h2>
        <p className="text-sm text-zinc-800 dark:text-zinc-200">
          Quem tiver este link vê seus voos: rota, horário e localizador. Não compartilhe. Se ele
          vazar, toque em “Gerar novo link”: o antigo para de funcionar na hora.
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <SectionTitle>Como adicionar</SectionTitle>
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-semibold">Google Agenda (no computador)</h3>
          <p className="text-zinc-700 dark:text-zinc-300">
            Abra{" "}
            <a
              href={GOOGLE_ADD_BY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand dark:text-brand-dark font-medium underline underline-offset-4"
            >
              Google Agenda → Adicionar agenda → Do URL
            </a>
            , cole o link e clique em “Adicionar agenda”. Ela aparece também no app do celular. O
            Google pode levar até um dia para mostrar mudanças.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <h3 className="font-semibold">iPhone</h3>
          <p className="text-zinc-700 dark:text-zinc-300">
            Toque em “Abrir no iPhone/Mac” logo depois de gerar o link. Ou vá em Ajustes → Apps →
            Calendário → Contas → Adicionar conta → Outra → Adicionar calendário assinado e cole o
            link.
          </p>
        </div>
      </section>
    </main>
  );
}

async function Status() {
  const user = await getCurrentUser();
  const supabase = await createSupabaseServerClient();
  const [profile, { data }] = await Promise.all([
    getProfile(user.id),
    supabase
      .from("calendar_feeds")
      .select("created_at, last_fetched_at")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const tz = profile?.timezone ?? "America/Sao_Paulo";
  const status = data
    ? [
        `Link ativo desde ${formatInZone(data.created_at as string, tz)}`,
        data.last_fetched_at
          ? `última leitura pelo calendário: ${formatInZone(data.last_fetched_at as string, tz)}`
          : "ainda não lido por nenhum calendário",
      ].join(" · ")
    : null;
  return <FeedPanel active={Boolean(data)} status={status} />;
}
