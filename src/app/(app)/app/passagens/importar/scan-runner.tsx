"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { advanceScanAction, type ProgressState } from "./actions";

const LABEL: Record<string, string> = {
  listing: "Procurando e-mails de viagem no Gmail…",
  filtering: "Separando o que parece passagem (sem IA)…",
  processing: "Lendo as passagens com IA…",
};

/** Mantém a varredura andando enquanto a tela está aberta (o agendador continua se fechar). */
export function ScanRunner({ initial }: { initial: string }) {
  const router = useRouter();
  const [p, setP] = useState<ProgressState>({ status: initial, total: 0, done: 0 });
  const running = useRef(true);

  useEffect(() => {
    running.current = true;
    (async () => {
      let errors = 0;
      while (running.current) {
        const r = await advanceScanAction().catch(() => null);
        if (!r) {
          if (++errors > 3) break;
          continue;
        }
        setP(r);
        if (!["listing", "filtering", "processing"].includes(r.status)) {
          router.refresh();
          break;
        }
      }
    })();
    return () => {
      running.current = false;
    };
  }, [router]);

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      <p className="text-sm font-medium">{LABEL[p.status] ?? "Atualizando…"}</p>
      {p.total ? (
        <>
          <progress className="w-full" max={p.total} value={p.done} />
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            {p.done} de {p.total} e-mails
          </p>
        </>
      ) : null}
      {p.error ? <p className="text-xs text-red-700 dark:text-red-300">{p.error}</p> : null}
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Pode fechar esta tela: a varredura continua sozinha a cada 5 minutos.
      </p>
    </div>
  );
}
