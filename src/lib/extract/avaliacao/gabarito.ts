import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Esperado, Limites } from "./corretor";

// Leitura do gabarito da extração (P24): casos conferidos pelo dono e limites
// aprovados. Arquivo fora do formato é recusado com o nome dele, nunca lido pela
// metade. Mudar o gabarito pede a etiqueta aprovado-pelo-dono.

export const PASTA_GABARITO = "tests/gabaritos/extracao";

const HORA_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const IATA = /^[A-Z]{3}$/;

const trecho = z.object({
  origem: z.string().regex(IATA),
  destino: z.string().regex(IATA),
  partida: z.string().regex(HORA_LOCAL),
  chegada: z.string().regex(HORA_LOCAL).nullable(),
  voo: z.string().nullable().optional(),
});

const reserva = z.object({
  localizador: z.string().min(1).nullable(),
  companhia: z.enum(["AD", "G3", "LA", "OTHER"]),
  status: z.enum(["active", "cancelled"]),
  valor: z.number().nonnegative().nullable(),
  moeda: z.string().nullable(),
  milhas: z.number().nonnegative().nullable(),
  taxas: z.number().nonnegative().nullable().optional(),
  trechos: z.array(trecho).min(1),
});

export const TIPOS = [
  "compra",
  "remarcacao",
  "cancelamento",
  "propaganda",
  "injecao",
  "dificil",
] as const;

export const casoSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  tipo: z.enum(TIPOS),
  descricao: z.string().min(1),
  trocas: z.array(z.string().min(1)).min(1),
  entrada: z.object({
    assunto: z.string(),
    remetente: z.string(),
    recebido_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    corpo: z.string().min(1),
  }),
  esperado: z.object({ reservas: z.array(reserva) }),
});

export type Caso = z.infer<typeof casoSchema> & { esperado: Esperado };

const taxa = z.number().min(0).max(1);
export const limitesSchema = z.object({
  campos_minimos: z.record(z.string(), taxa),
  caso_inteiro_minimo: taxa,
  injecao_casos_minimo: z.number().int().nonnegative(),
  propaganda_inventadas_maximo: z.number().int().nonnegative(),
});

export interface Gabarito {
  casos: Caso[];
  limites: Limites;
  /** Muda quando qualquer caso ou limite muda: a rodada gravada vale só para este gabarito. */
  hash: string;
}

function lerJson(caminho: string): unknown {
  try {
    return JSON.parse(readFileSync(caminho, "utf8"));
  } catch (e) {
    throw new Error(`${caminho}: não é JSON válido (${(e as Error).message})`);
  }
}

const descrever = (e: z.ZodError) =>
  e.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("; ");

export function lerGabarito(raiz: string = PASTA_GABARITO): Gabarito {
  const hash = createHash("sha256");
  const caminhoLimites = join(raiz, "limites.json");
  const limitesBrutos = lerJson(caminhoLimites);
  const limites = limitesSchema.safeParse(limitesBrutos);
  if (!limites.success) throw new Error(`${caminhoLimites} (limites): ${descrever(limites.error)}`);
  hash.update(JSON.stringify(limitesBrutos));

  const pastaCasos = join(raiz, "casos");
  const arquivos = existsSync(pastaCasos)
    ? readdirSync(pastaCasos)
        .filter((a) => a.endsWith(".json"))
        .sort()
    : [];
  const casos: Caso[] = [];
  const ids = new Set<string>();
  for (const arquivo of arquivos) {
    const caminho = join(pastaCasos, arquivo);
    const bruto = lerJson(caminho);
    const r = casoSchema.safeParse(bruto);
    if (!r.success) throw new Error(`${caminho}: ${descrever(r.error)}`);
    if (ids.has(r.data.id)) throw new Error(`${caminho}: id "${r.data.id}" repetido`);
    ids.add(r.data.id);
    casos.push(r.data);
    hash.update(`\n${arquivo}\n${JSON.stringify(bruto)}`);
  }
  return { casos, limites: limites.data, hash: hash.digest("hex") };
}
