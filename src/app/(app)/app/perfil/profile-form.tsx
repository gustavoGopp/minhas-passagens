"use client";
import { useActionState } from "react";
import type { Profile } from "@/lib/profiles/repo";
import { saveProfileAction, type ProfileFormState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium";

export function ProfileForm({ profile, ufs }: { profile: Profile; ufs: readonly string[] }) {
  const [state, action, pending] = useActionState<ProfileFormState, FormData>(
    saveProfileAction,
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={labelClass}>
        Nome
        <input
          className={inputClass}
          name="display_name"
          defaultValue={profile.display_name ?? ""}
        />
      </label>
      <label className={labelClass}>
        E-mail
        <input className={inputClass} value={profile.email ?? ""} disabled readOnly />
      </label>
      <label className={labelClass}>
        Fuso horário
        <input className={inputClass} name="timezone" defaultValue={profile.timezone} />
      </label>
      <label className={labelClass}>
        Estado (para feriados estaduais)
        <select className={inputClass} name="uf" defaultValue={profile.uf ?? ""}>
          <option value="">Nenhum</option>
          {ufs.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <label className={labelClass}>
          Silêncio: início
          <input
            className={inputClass}
            type="time"
            name="quiet_hours_start"
            defaultValue={profile.quiet_hours_start.slice(0, 5)}
          />
        </label>
        <label className={labelClass}>
          Silêncio: fim
          <input
            className={inputClass}
            type="time"
            name="quiet_hours_end"
            defaultValue={profile.quiet_hours_end.slice(0, 5)}
          />
        </label>
      </div>
      <label className={labelClass}>
        Guardar e-mails e prints originais por (dias)
        <input
          className={inputClass}
          type="number"
          min={0}
          max={365}
          name="original_retention_days"
          defaultValue={profile.original_retention_days}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-green-700 dark:text-green-300">Perfil salvo.</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
