import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import {
  addDaysIso,
  addMonthsIso,
  formatDateFr,
  monthGridDays,
  startOfMonthIso,
  startOfWeekIso,
  todayParis,
} from "@/lib/dates";
import { PLAN_ACTIVITY_LABELS, PLAN_PERIOD_LABELS } from "@/lib/labels";
import {
  canEditPlanning,
  getRange,
  listAnimateurs,
} from "@/services/planning.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { CalendarMonth } from "@/components/calendar-month";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { PlanningGrid } from "./planning-grid";

export const metadata: Metadata = { title: "Planning des animateurs" };

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const MONTH_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

type View = "jour" | "semaine" | "mois";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "planning:read")) return <AccessDenied />;

  const params = await searchParams;
  const view: View =
    params.vue === "jour" || params.vue === "mois" ? params.vue : "semaine";
  const anchor =
    typeof params.semaine === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.semaine)
      ? params.semaine
      : todayParis();

  // Bornes de la période affichée + pas de navigation selon la vue.
  let from: string;
  let to: string;
  let prevAnchor: string;
  let nextAnchor: string;
  let periodLabel: string;
  if (view === "jour") {
    from = anchor;
    to = anchor;
    prevAnchor = addDaysIso(anchor, -1);
    nextAnchor = addDaysIso(anchor, 1);
    periodLabel = `${DAY_FORMAT.format(new Date(`${anchor}T00:00:00`))} ${formatDateFr(anchor)}`;
  } else if (view === "mois") {
    const weeks = monthGridDays(anchor);
    from = weeks[0][0];
    to = weeks[weeks.length - 1][6];
    prevAnchor = startOfMonthIso(addMonthsIso(startOfMonthIso(anchor), -1));
    nextAnchor = startOfMonthIso(addMonthsIso(startOfMonthIso(anchor), 1));
    periodLabel = MONTH_FORMAT.format(new Date(`${startOfMonthIso(anchor)}T00:00:00`));
  } else {
    from = startOfWeekIso(anchor);
    to = addDaysIso(from, 6);
    prevAnchor = addDaysIso(from, -7);
    nextAnchor = addDaysIso(from, 7);
    periodLabel = `semaine du ${formatDateFr(from)} au ${formatDateFr(to)}`;
  }

  const [animateurs, entries, stores] = await Promise.all([
    listAnimateurs(user),
    getRange(user, { from, to }),
    listStores(user),
  ]);

  const days = Array.from(
    { length: view === "jour" ? 1 : 7 },
    (_, i) => {
      const date = addDaysIso(view === "jour" ? anchor : startOfWeekIso(anchor), i);
      return {
        date,
        label: `${DAY_FORMAT.format(new Date(`${date}T00:00:00`))} ${formatDateFr(date)}`,
      };
    }
  );

  // Vue mois : une puce par créneau, cliquable vers la semaine concernée.
  const monthCells = new Map<string, React.ReactNode>();
  if (view === "mois") {
    const byDate = new Map<string, typeof entries>();
    for (const entry of entries) {
      byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
    }
    for (const [date, list] of byDate) {
      monthCells.set(
        date,
        list.map((entry) => (
          <Link
            key={entry.id}
            href={`/animation/planning?vue=semaine&semaine=${date}`}
            className="block truncate rounded bg-accent px-1 py-0.5 text-[11px] hover:bg-accent/70"
            title={`${entry.animateur.firstName} ${entry.animateur.lastName} — ${
              PLAN_ACTIVITY_LABELS[entry.activity]
            } (${PLAN_PERIOD_LABELS[entry.period]})`}
          >
            <span className="font-medium">{entry.animateur.firstName}</span>{" "}
            · {PLAN_ACTIVITY_LABELS[entry.activity]}
          </Link>
        ))
      );
    }
  }

  const viewLink = (v: View) =>
    `/animation/planning?vue=${v}&semaine=${anchor}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Planning des animateurs</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)} —
            glissez-déposez un créneau pour le déplacer ; l&apos;animateur est
            notifié quand son planning est modifié par un tiers.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5">
            {(["jour", "semaine", "mois"] as const).map((v) => (
              <Button
                key={v}
                variant={view === v ? "default" : "ghost"}
                size="sm"
                asChild
              >
                <Link href={viewLink(v)} data-testid={`view-${v}`}>
                  {v === "jour" ? "Jour" : v === "semaine" ? "Semaine" : "Mois"}
                </Link>
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/animation/planning?vue=${view}&semaine=${prevAnchor}`}
              data-testid="prev-week"
            >
              ← Précédent
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/animation/planning?vue=${view}`}>Aujourd&apos;hui</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/animation/planning?vue=${view}&semaine=${nextAnchor}`}
              data-testid="next-week"
            >
              Suivant →
            </Link>
          </Button>
        </div>
      </div>

      {animateurs.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Aucun animateur actif.
        </p>
      ) : view === "mois" ? (
        <div className="space-y-3">
          <CalendarMonth month={anchor} cells={monthCells} today={todayParis()} />
          <p className="text-xs text-muted-foreground">
            <Badge variant="secondary" className="mr-1 px-1 text-[10px]">
              Astuce
            </Badge>
            Cliquez sur un créneau pour ouvrir la semaine correspondante (le
            glisser-déposer se fait en vue jour ou semaine).
          </p>
        </div>
      ) : (
        <PlanningGrid
          days={days}
          animateurs={animateurs.map((a) => ({
            id: a.id,
            name: `${a.firstName} ${a.lastName}`,
            canEdit: can(user, "planning:write") && canEditPlanning(user, a.id),
          }))}
          entries={entries.map((e) => ({
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
