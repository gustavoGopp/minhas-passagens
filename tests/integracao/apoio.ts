// Apoio aos testes de integração: fluxos do servidor contra o Supabase local.
//
// - Pessoas fictícias são criadas pelo Auth local (e-mails @example.com).
// - A "sessão" das ações do servidor é a pessoa escolhida com entrarComo(): os
//   testes trocam @/lib/supabase/server e @/lib/auth/current-user por esta sessão.
// - A rede de fora é falsa: cada serviço externo responde pelo que o teste mandar,
//   e endereço desconhecido é recusado. Só o Supabase local passa pela rede real.
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import { ambiente } from "../banco/apoio";
import { criarPessoa } from "../banco/preparar";

export interface PessoaTeste {
  id: string;
  email: string;
  /** Cliente do supabase-js logado como esta pessoa (passa pelas regras de acesso). */
  cliente: SupabaseClient;
}

const SENHA = `senha-${randomUUID()}`;

export async function novaPessoa(prefixo: string): Promise<PessoaTeste> {
  const email = `${prefixo}-${randomUUID().slice(0, 8)}@example.com`;
  const id = await criarPessoa(email, SENHA);
  const cliente = createClient(ambiente.apiUrl, ambiente.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: SENHA });
  if (error) throw error;
  return { id, email, cliente };
}

/** Cliente com a chave de serviço do Supabase local (ignora as regras de acesso). */
export function admin(): SupabaseClient {
  return createClient(ambiente.apiUrl, ambiente.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const sessao: { atual: PessoaTeste | null } = { atual: null };

export function entrarComo(p: PessoaTeste) {
  sessao.atual = p;
}

export function pessoaDaSessao(): PessoaTeste {
  if (!sessao.atual) throw new Error("Nenhuma pessoa na sessão: chame entrarComo().");
  return sessao.atual;
}

/** O que getCurrentUser devolveria para a pessoa da sessão. */
export function usuarioDaSessao() {
  const p = pessoaDaSessao();
  return { id: p.id, email: p.email, name: "Pessoa Fictícia", avatarUrl: null };
}

// ---------- rede falsa ----------

export interface Chamada {
  url: string;
  metodo: string;
  corpo: string;
}

type Rota = (url: URL, chamada: Chamada) => Response | Promise<Response>;

const fetchReal = globalThis.fetch;

export const rede = {
  chamadas: [] as Chamada[],
  rotas: new Map<string, Rota>(),
  /** Chamadas feitas a um serviço (pelo endereço). */
  para(host: string) {
    return this.chamadas.filter((c) => new URL(c.url).host === host);
  },
};

/**
 * Troca o fetch global: o Supabase local passa direto; cada host em `rotas`
 * responde pela função dada; qualquer outro endereço é recusado com erro.
 */
export function instalarRedeFalsa(rotas: Record<string, Rota>) {
  rede.chamadas = [];
  rede.rotas = new Map(Object.entries(rotas));
  const local = new URL(ambiente.apiUrl).host;
  vi.stubGlobal("fetch", async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (url.host === local) return fetchReal(entrada, init);
    const corpo =
      typeof init?.body === "string"
        ? init.body
        : init?.body instanceof URLSearchParams
          ? init.body.toString()
          : "";
    const chamada = { url: url.toString(), metodo: init?.method ?? "GET", corpo };
    rede.chamadas.push(chamada);
    const rota = rede.rotas.get(url.host);
    if (!rota) throw new Error(`Rede externa bloqueada no teste: ${url.host}`);
    return rota(url, chamada);
  });
}

export function json(dados: unknown, status = 200): Response {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json" },
  });
}
