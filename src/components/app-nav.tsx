"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Ícones em SVG (sem dependência), 24 px, traço de 1,8. */
const icon = {
  plane: (
    <path d="M10.5 3.5 13 3l1 7 5.5 2.5c.7.3 1 .9 1 1.5l-6.5-1-1 5 2 1.5V21l-3.5-1L8 21v-1.5l2-1.5-1-5-6.5 1c0-.6.3-1.2 1-1.5L9 10l1.5-6.5Z" />
  ),
  chart: <path d="M4 19h16M5 15l4-4 3 3 6-7M18 7h1.5V8.5" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="18.5" cy="12" r="1.4" />
    </>
  ),
};

const items = [
  {
    href: "/app",
    label: "Passagens",
    icon: icon.plane,
    match: (p: string) =>
      p === "/app" || p.startsWith("/app/passagens") || p.startsWith("/app/conferir"),
  },
  {
    href: "/app/monitor",
    label: "Preços",
    icon: icon.chart,
    match: (p: string) => p.startsWith("/app/monitor"),
  },
  {
    href: "/app/calendario",
    label: "Calendário",
    icon: icon.calendar,
    match: (p: string) => p.startsWith("/app/calendario"),
  },
  {
    href: "/app/conta",
    label: "Mais",
    icon: icon.more,
    // Telas que ficam em "Mais".
    match: (p: string) =>
      [
        "/app/conta",
        "/app/perfil",
        "/app/integracoes",
        "/app/notificacoes",
        "/app/gastos",
        "/app/creditos",
      ].some((x) => p.startsWith(x)),
  },
];

export function AppNav() {
  return <NavList pathname={usePathname()} />;
}

/** Versão sem destaque, usada no shell estático enquanto a rota resolve. */
export function NavList({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:static sm:border-t-0 sm:border-b sm:pb-0 dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="mx-auto flex w-full max-w-3xl justify-around sm:justify-start sm:gap-2 sm:px-4 sm:py-2">
        {items.map((item) => {
          const active = pathname != null && item.match(pathname);
          return (
            <li key={item.href} className="flex-1 sm:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-xs font-medium sm:min-h-0 sm:flex-row sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm ${
                  active
                    ? "text-brand dark:text-brand-dark sm:bg-brand-soft sm:dark:bg-brand-dark-soft"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full sm:h-auto sm:w-auto ${
                    active
                      ? "bg-brand-soft dark:bg-brand-dark-soft sm:bg-transparent sm:dark:bg-transparent"
                      : ""
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {item.icon}
                  </svg>
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
