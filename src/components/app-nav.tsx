"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/app", label: "Passagens" },
  { href: "/app/monitor", label: "Preços" },
  { href: "/app/calendario", label: "Calendário" },
  { href: "/app/conta", label: "Mais" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 backdrop-blur sm:static sm:border-t-0 sm:border-b sm:bg-transparent dark:border-zinc-800 dark:bg-zinc-950/95"
    >
      <ul className="mx-auto flex w-full max-w-2xl justify-around sm:justify-start sm:gap-6 sm:px-4">
        {items.map((item) => {
          const active =
            item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`block px-3 py-3 text-xs font-medium sm:text-sm ${
                  active ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
