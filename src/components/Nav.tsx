"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/", label: "Ideias", short: "Ideias" },
  { href: "/roteiros", label: "Roteiros", short: "Roteiros" },
  { href: "/grupos", label: "Grupos", short: "Grupos" },
  { href: "/config", label: "Config", short: "Config" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  if (pathname === "/login") return null;

  return (
    <>
      <header className="mx-auto flex w-full max-w-5xl items-start justify-between gap-3 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:items-center md:py-5">
        <div className="min-w-0">
          <p className="text-[0.65rem] uppercase tracking-[0.18em] text-[var(--ink-soft)] md:text-xs">
            Gerador Reels
          </p>
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">
            Dúvidas → Roteiros
          </h1>
        </div>

        {/* Desktop nav */}
        <nav className="hidden flex-wrap items-center gap-4 text-sm md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              data-active={isActive(pathname, link.href)}
            >
              {link.label}
            </Link>
          ))}
          <button
            type="button"
            className="btn btn-secondary text-sm"
            onClick={logout}
          >
            Sair
          </button>
        </nav>

        <button
          type="button"
          className="btn btn-secondary shrink-0 px-3 py-2 text-sm md:hidden"
          onClick={logout}
        >
          Sair
        </button>
      </header>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[rgba(255,252,246,0.94)] px-2 pt-2 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto grid max-w-5xl grid-cols-5 gap-1">
          {LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex min-h-12 flex-col items-center justify-center rounded-xl px-1 text-center text-[0.7rem] leading-tight ${
                  active
                    ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {link.short}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
