"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "./nav-config";

// `allowedHrefs` est calculé côté serveur à partir de la matrice de
// permissions : le filtrage UI n'est que cosmétique, la garde autoritaire
// reste dans chaque page/action. `badges` (étape 54) : compteurs par href,
// calculés côté serveur eux aussi (ex. notes de frais à rembourser).
export function Sidebar({
  allowedHrefs,
  badges = {},
}: {
  allowedHrefs: string[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const allowed = new Set(allowedHrefs);

  return (
    <aside className="hidden w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-2.5 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brand-foreground shadow-sm">
          M
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-sidebar-accent-foreground">
            CRM Big M
          </div>
          <div className="text-xs text-sidebar-foreground/80">Réseau de franchise</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 pt-2">
        {NAV_SECTIONS.map((section, i) => {
          const items = section.items.filter((item) => allowed.has(item.href));
          if (items.length === 0) return null;
          return (
            <div key={i}>
              {section.title ? (
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
                  {section.title}
                </div>
              ) : null}
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-sm ring-1 ring-black/[0.04]"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{item.label}</span>
                        {(badges[item.href] ?? 0) > 0 ? (
                          <span
                            className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-foreground"
                            data-testid={`nav-badge-${item.href.replaceAll("/", "-").slice(1)}`}
                          >
                            {badges[item.href]}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
