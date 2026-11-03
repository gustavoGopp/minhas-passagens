"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { emptyDraft, type BookingDraft } from "@/lib/trips/draft";
import { extractAction, type ExtractState } from "../actions";
import { BookingForm } from "../booking-form";

type Mode = "texto" | "print" | "manual";

/** Reduz prints grandes para JPEG de até 2000 px, cabendo no limite de envio. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size < 1_500_000) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  return blob ? new File([blob], "print.jpg", { type: "image/jpeg" }) : file;
}

export function NewBookingFlow({ hasKey }: { hasKey: boolean }) {
  const [mode, setMode] = useState<Mode>(hasKey ? "texto" : "manual");
  const [state, extract, extracting] = useActionState<ExtractState, FormData>(extractAction, {});
  const [preparing, startPreparing] = useTransition();
  const [saved, setSaved] = useState<number[]>([]);
  const router = useRouter();

  const drafts: BookingDraft[] = mode === "manual" ? [emptyDraft()] : (state.drafts ?? []);
  const busy = extracting || preparing;

  const onSaved = (index: number) => (id: string) => {
    const next = saved.includes(index) ? saved : [...saved, index];
    setSaved(next);
    if (next.length >= drafts.length)
      router.push(drafts.length === 1 ? `/app/passagens/${id}` : "/app");
  };

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        className="grid grid-cols-3 rounded-lg border border-zinc-300 p-1 text-sm dark:border-zinc-700"
      >
        {(["texto", "print", "manual"] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2 py-2 ${mode === m ? "bg-brand hover:bg-brand-strong dark:bg-brand-dark text-white dark:text-zinc-950" : ""}`}
          >
            {m === "texto" ? "Colar texto" : m === "print" ? "Print/PDF" : "Manual"}
          </button>
        ))}
      </div>

      {mode !== "manual" && !hasKey ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          A leitura automática usa sua chave da Anthropic (custa centavos).{" "}
          <Link className="underline underline-offset-2" href="/app/integracoes">
            Cadastrar chave
          </Link>{" "}
          ou use o modo Manual.
        </p>
      ) : null}

      {mode === "texto" && hasKey ? (
        <form action={extract} className="flex flex-col gap-2">
          <textarea
            name="text"
            rows={8}
            required
            placeholder="Cole aqui o e-mail de confirmação da companhia ou da agência."
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base sm:text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            disabled={busy}
            className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
          >
            {busy ? "Lendo…" : "Ler com IA"}
          </button>
        </form>
      ) : null}

      {mode === "print" && hasKey ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const file = fd.get("file");
            startPreparing(async () => {
              if (file instanceof File && file.size > 0) fd.set("file", await shrinkImage(file));
              extract(fd);
            });
          }}
        >
          <input
            name="file"
            type="file"
            accept="image/*,application/pdf"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-200 file:px-3 file:py-2 dark:file:bg-zinc-800"
          />
          <button
            disabled={busy}
            className="bg-brand hover:bg-brand-strong dark:bg-brand-dark rounded-xl px-4 py-3 text-sm font-medium text-white disabled:opacity-60 dark:text-zinc-950"
          >
            {busy ? "Lendo…" : "Ler com IA"}
          </button>
        </form>
      ) : null}

      {mode !== "manual" && state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {mode !== "manual" && state.warnings?.length ? (
        <ul className="list-disc rounded-lg bg-zinc-50 p-3 pl-6 text-sm text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          {state.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}

      {drafts.length > 0 && mode !== "manual" ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Confira os dados antes de salvar
          {drafts.length > 1 ? ` (${drafts.length} reservas encontradas)` : ""}.
        </p>
      ) : null}

      {drafts.map((d, i) =>
        saved.includes(i) ? (
          <p key={i} className="text-sm text-green-700 dark:text-green-300">
            Reserva {d.locator || i + 1} salva.
          </p>
        ) : (
          <section key={`${mode}-${i}-${d.locator}`} className="flex flex-col gap-2">
            {drafts.length > 1 ? (
              <h2 className="font-semibold">Reserva {d.locator || i + 1}</h2>
            ) : null}
            <BookingForm initial={d} onSaved={onSaved(i)} />
          </section>
        ),
      )}
    </div>
  );
}
