import { z } from "zod";

/**
 * Variáveis públicas (prefixo NEXT_PUBLIC_) são embutidas no bundle do cliente
 * pelo Next.js; por isso são lidas por nome literal, não via process.env[chave].
 */
const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Base64 de 32 bytes. Gere com: openssl rand -base64 32 */
  BYOK_MASTER_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, "base64").length === 32,
      "BYOK_MASTER_KEY deve ter 32 bytes em base64",
    ),
  EXTRACTION_MODEL_DEFAULT: z.string().default("claude-haiku-5-5"),
  EXTRACTION_MODEL_RETRY: z.string().default("claude-sonnet-5-5"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(prefix: string, error: z.ZodError): string {
  const lines = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  return `${prefix}\n${lines.join("\n")}\nVeja .env.example para os nomes esperados.`;
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) {
    throw new Error(
      formatIssues("Variáveis públicas de ambiente ausentes ou inválidas:", result.error),
    );
  }
  return result.data;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    throw new Error(formatIssues("Variáveis de servidor ausentes ou inválidas:", result.error));
  }
  return result.data;
}

let publicCache: PublicEnv | undefined;
let serverCache: ServerEnv | undefined;

/** Variáveis públicas, validadas uma vez. Seguras para uso no cliente. */
export function publicEnv(): PublicEnv {
  publicCache ??= parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  return publicCache;
}

/** Variáveis de servidor, validadas uma vez. Nunca importe em componentes cliente. */
export function serverEnv(): ServerEnv {
  serverCache ??= parseServerEnv(process.env);
  return serverCache;
}
