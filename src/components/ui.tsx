import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Peças base da interface (mesmo visual em todas as telas). As cores vêm dos
 * tokens de `globals.css`; contraste AA conferido nos dois temas.
 */
export const button = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-strong dark:bg-brand-dark dark:text-zinc-950 dark:hover:bg-brand-dark/90",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950",
  link: "text-sm font-medium text-brand underline underline-offset-4 dark:text-brand-dark",
} as const;

export function Card({
  children,
  className = "",
  tone = "default",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "warn";
} & React.HTMLAttributes<HTMLElement>) {
  const base =
    tone === "warn"
      ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
  return (
    <section
      className={`flex flex-col gap-3 rounded-2xl border p-4 shadow-sm ${base} ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

/** Título de seção em caixa alta discreta (listas: Próximos, Anteriores…). */
export function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="text-xs font-semibold tracking-wider text-zinc-600 uppercase dark:text-zinc-400"
    >
      {children}
    </h2>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "warn" | "danger" | "ok";
}) {
  const t = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    brand: "bg-brand-soft text-brand dark:bg-brand-dark-soft dark:text-brand-dark",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
    ok: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  }[tone];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof button;
  className?: string;
}) {
  return (
    <Link href={href} className={`${button[variant]} ${className}`}>
      {children}
    </Link>
  );
}
