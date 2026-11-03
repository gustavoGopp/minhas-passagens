"use client";

/** Erro no layout raiz: substitui o documento inteiro, então leva o próprio estilo. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 420,
          margin: "0 auto",
          padding: "64px 24px",
          lineHeight: 1.5,
        }}
      >
        <title>Erro · Minhas Passagens</title>
        <h1 style={{ fontSize: 22 }}>O Minhas Passagens não abriu</h1>
        <p>Isso costuma passar em alguns segundos. Seus dados estão salvos.</p>
        <button type="button" onClick={() => retry()} style={{ padding: "8px 16px", fontSize: 14 }}>
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
