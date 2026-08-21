import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addDaysIso, formatDateFr, startOfWeekIso, todayParis } from "@/lib/dates";
import { canEditPlanning, getWeek, listAnimateurs } from "@/services/planning.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Button } from "@/components/ui/button";

import { PlanningGrid } from "./planning-grid";

export const metadata: Metadata = { title: "Planning des animateurs" };

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "planning:read")) return <AccessDenied />;

  const params = await searchParams;
  const requested =
    typeof params.semaine === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.semaine)
      ? params.semaine
      : todayParis();
  const monday = startOfWeekIso(requested);

  const [animateurs, week, stores] = await Promise.all([
    listAnimateurs(user),
    getWeek(user, { weekStart: monday }),
    listStores(user),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDaysIso(monday, i);
    return {
      date,
      label: `${DAY_FORMAT.format(new Date(`${date}T00:00:00`))} ${formatDateFr(date)}`,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planning des animateurs</h1>
          <p className="text-sm text-muted-foreground">
            Semaine du {formatDateFr(week.monday)} au {formatDateFr(week.sunday)} —
            l&apos;animateur est notifié quand son planning est modifié par un
            tiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/animation/planning?semaine=${addDaysIso(monday, -7)}`}
              data-testid="prev-week"
            >
              ← Semaine précédente
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/animation/planning">Aujourd&apos;hui</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/animation/planning?semaine=${addDaysIso(monday, 7)}`}
              data-testid="next-week"
            >
              Semaine suivante →
            </Link>
          </Button>
        </div>
      </div>

      {animateurs.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Aucun animateur actif.
        </p>
      ) : (
        <PlanningGrid
          days={days}
          animateurs={animateurs.map((a) => ({
            id: a.id,
            name: `${a.firstName} ${a.lastName}`,
            canEdit: can(user, "planning:write") && canEditPlanning(user, a.id),
          }))}
          entries={week.entries.map((e) => ({
            id: e.id,
            animateurId: e.animateurId,
            date: e.date,
            period: e.period,
            activity: e.activity,
            storeId: e.storeId,
            storeLabel: e.store ? `${e.store.code} — ${e.store.name}` : null,
            label: e.label,
            kmEstimated: e.kmEstimated,
            notes: e.notes,
          }))}
          stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        />
      )}
    </div>
  );
}
