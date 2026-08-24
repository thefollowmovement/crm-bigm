import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { isFranchisorMember } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import {
  addDaysIso,
  addMonthsIso,
  formatDateFr,
  monthGridDays,
  startOfMonthIso,
  todayParis,
} from "@/lib/dates";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/labels";
import { listEmployees } from "@/services/employees.service";
import { listLeaves } from "@/services/leaves.service";
import { AccessDenied } from "@/components/access-denied";
import { CalendarMonth } from "@/components/calendar-month";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CreateLeaveDialog,
  DecideLeaveButtons,
  LeaveStatusFilter,
  LeaveStoreFilter,
} from "./leave-components";

export const metadata: Metadata = { title: "Congés" };

const STATUSES = Object.keys(LEAVE_STATUS_LABELS);
type LeaveStatus = "DEMANDEE" | "VALIDEE" | "REFUSEE" | "ANNULEE";

const MONTH_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
});

export default async function LeavesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "hr:read")) return <AccessDenied />;

  const params = await searchParams;
  const status =
    typeof params.statut === "string" && STATUSES.includes(params.statut)
      ? (params.statut as LeaveStatus)
      : undefined;
  const view = params.vue === "calendrier" ? "calendrier" : "liste";
  const month =
    typeof params.mois === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.mois)
      ? startOfMonthIso(params.mois)
      : startOfMonthIso(todayParis());
  const storeFilter = typeof params.boutique === "string" ? params.boutique : "";

  // Bornes de la grille calendaire (semaines complètes, mois voisins inclus).
  const weeks = monthGridDays(month);
  const gridFrom = weeks[0][0];
  const gridTo = weeks[weeks.length - 1][6];

  const canWrite = can(user, "hr:write");
  const [leaves, employees] = await Promise.all([
    view === "calendrier"
      ? listLeaves(user, { overlapping: { from: gridFrom, to: gridTo } })
      : listLeaves(user, { status }),
    listEmployees(user),
  ]);

  // Vue calendrier : congés à venir ou en attente, filtrés par boutique.
  const calendarLeaves =
    view === "calendrier"
      ? leaves
          .filter((l) => l.status === "DEMANDEE" || l.status === "VALIDEE")
          .filter((l) =>
            storeFilter === ""
              ? true
              : storeFilter === "SIEGE"
                ? l.employee.storeId === null
                : l.employee.storeId === storeFilter
          )
      : [];

  const cells = new Map<string, React.ReactNode>();
  if (view === "calendrier") {
    const byDate = new Map<string, typeof calendarLeaves>();
    for (const leave of calendarLeaves) {
      const start = leave.startDate < gridFrom ? gridFrom : leave.startDate;
      const end = leave.endDate > gridTo ? gridTo : leave.endDate;
      for (let day = start; day <= end; day = addDaysIso(day, 1)) {
        byDate.set(day, [...(byDate.get(day) ?? []), leave]);
      }
    }
    for (const [day, list] of byDate) {
      cells.set(
        day,
        list.map((leave) => (
          <Link
            key={leave.id}
            href={`/rh/salaries/${leave.employee.id}`}
            className={`block truncate rounded px-1 py-0.5 text-[11px] ${
              leave.status === "VALIDEE"
                ? "bg-emerald-500/15 text-emerald-800 hover:bg-emerald-500/25 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-800 hover:bg-amber-500/25 dark:text-amber-300"
            }`}
            title={`${leave.employee.firstName} ${leave.employee.lastName} — ${
              LEAVE_TYPE_LABELS[leave.type]
            } du ${formatDateFr(leave.startDate)} au ${formatDateFr(leave.endDate)} (${
              LEAVE_STATUS_LABELS[leave.status]
            }) — ${
              leave.employee.store
                ? `${leave.employee.store.code} — ${leave.employee.store.name}`
                : "Siège Big M CIE"
            }`}
            data-testid="leave-chip"
          >
            <span className="font-medium">
              {leave.employee.firstName} {leave.employee.lastName.charAt(0)}.
            </span>
            {leave.status === "DEMANDEE" ? " ?" : ""}
          </Link>
        ))
      );
    }
  }

  // Options du filtre boutique : boutiques distinctes des salariés visibles.
  const storeOptions = [
    ...new Map(
      employees
        .filter((e) => e.store !== null)
        .map((e) => [e.store!.id, { id: e.store!.id, label: `${e.store!.code} — ${e.store!.name}` }])
    ).values(),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const prevMonth = startOfMonthIso(addMonthsIso(month, -1));
  const nextMonth = startOfMonthIso(addMonthsIso(month, 1));
  const calendarLink = (mois: string) =>
    `/rh/conges?vue=calendrier&mois=${mois}${storeFilter ? `&boutique=${storeFilter}` : ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Congés</h1>
          <p className="text-sm text-muted-foreground">
            {view === "calendrier"
              ? `Calendrier des absences — ${MONTH_FORMAT.format(
                  new Date(`${month}T00:00:00`)
                )}`
              : "Demandes des salariés : validation ou refus par la RH."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border p-0.5">
            <Button
              variant={view === "liste" ? "default" : "ghost"}
              size="sm"
              asChild
            >
              <Link href="/rh/conges" data-testid="conges-view-liste">
                Liste
              </Link>
            </Button>
            <Button
              variant={view === "calendrier" ? "default" : "ghost"}
              size="sm"
              asChild
            >
              <Link href={calendarLink(month)} data-testid="conges-view-calendrier">
                Calendrier
              </Link>
            </Button>
          </div>
          {canWrite ? (
            <CreateLeaveDialog
              employees={employees.map((e) => ({
                id: e.id,
                label: `${e.firstName} ${e.lastName}`,
              }))}
            />
          ) : null}
        </div>
      </div>

      {view === "calendrier" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <LeaveStoreFilter
              current={storeFilter}
              stores={storeOptions}
              showSiege={isFranchisorMember(user)}
            />
            <Button variant="outline" size="sm" asChild>
              <Link href={calendarLink(prevMonth)} data-testid="prev-month">
                ← Mois précédent
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={calendarLink(startOfMonthIso(todayParis()))}>
                Aujourd&apos;hui
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={calendarLink(nextMonth)} data-testid="next-month">
                Mois suivant →
              </Link>
            </Button>
          </div>
          <CalendarMonth
            month={month}
            cells={cells}
            today={todayParis()}
            testId="leaves-calendar"
          />
          <p className="text-xs text-muted-foreground">
            <Badge variant="success" className="mr-1">
              Validée
            </Badge>
            congés validés ·{" "}
            <Badge variant="secondary" className="mx-1">
              Demandée ?
            </Badge>
            en attente de décision — cliquez sur un nom pour ouvrir la fiche du
            salarié.
          </p>
        </>
      ) : (
        <>
          <LeaveStatusFilter current={status ?? ""} />

          <div className="rounded-xl border bg-card">
            <Table data-testid="leaves-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Salarié</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Période</TableHead>
                  <TableHead>Commentaire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Décision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaves.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Aucune demande pour ce filtre.
                    </TableCell>
                  </TableRow>
                ) : (
                  leaves.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell>
                        <Link
                          href={`/rh/salaries/${leave.employee.id}`}
                          className="font-medium underline-offset-2 hover:underline"
                        >
                          {leave.employee.firstName} {leave.employee.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>{LEAVE_TYPE_LABELS[leave.type]}</TableCell>
                      <TableCell>
                        du {formatDateFr(leave.startDate)} au{" "}
                        {formatDateFr(leave.endDate)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">
                        {leave.comment ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            leave.status === "VALIDEE"
                              ? "success"
                              : leave.status === "REFUSEE"
                                ? "destructive"
                                : "secondary"
                          }
                          data-testid="leave-status"
                        >
                          {LEAVE_STATUS_LABELS[leave.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {canWrite && leave.status === "DEMANDEE" ? (
                          <DecideLeaveButtons leaveId={leave.id} />
                        ) : leave.decidedBy ? (
                          <span className="text-xs text-muted-foreground">
                            par {leave.decidedBy.firstName} {leave.decidedBy.lastName}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
