"use client";
import { useActionState, useState } from "react";
import type { Profile } from "@/lib/profiles/repo";
import { saveProfileAction, type ProfileFormState } from "./actions";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const labelClass = "flex flex-col gap-1 text-sm font-medium";

export interface CityOption {
  code: string;
  uf: string;
  name: string;
}

export function ProfileForm({
  profile,
  ufs,
  cities,
}: {
  profile: Profile;
  ufs: readonly string[];
  cities: CityOption[];
}) {
  const [uf, setUf] = useState(profile.uf ?? "");
  const citiesOfUf = cities.filter((c) => c.uf === uf);
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
        <select className={inputClass} name="uf" value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">Nenhum</option>
          {ufs.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Cidade (para feriados municipais)
        <select
          key={uf}
          className={inputClass}
          name="holiday_city"
          defaultValue={profile.uf === uf ? (profile.holiday_city ?? "") : ""}
          disabled={citiesOfUf.length === 0}
        >
          <option value="">
            {citiesOfUf.length ? "Nenhuma" : "Sem cidades cadastradas nesta UF"}
          </option>
          {citiesOfUf.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
          Sua cidade não está na lista? Cadastre os feriados dela no Calendário.
        </span>
      </label>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <legend className="px-1 text-sm font-medium">Feriados no calendário</legend>
        <Check name="show_optional_holidays" defaultChecked={profile.show_optional_holidays}>
          Pontos facultativos (Carnaval, Corpus Christi)
        </Check>
        <Check name="show_christian_holidays" defaultChecked={profile.show_christian_holidays}>
          Datas cristãs móveis (Ramos, Páscoa, Ascensão, Pentecostes)
        </Check>
        <Check name="show_jewish_holidays" defaultChecked={profile.show_jewish_holidays}>
          Feriados judaicos (começam ao pôr do sol da véspera)
        </Check>
        <Check name="jewish_israel" defaultChecked={profile.jewish_israel}>
          Usar calendário de Israel (um dia de festa em vez de dois)
        </Check>
      </fieldset>
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

function Check({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>{children}</span>
    </label>
  );
}
