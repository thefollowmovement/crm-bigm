import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import {
  ACTION_PLAN_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
} from "@/lib/labels";
import {
  formatPlanNumber,
  isPlanLate,
  listAssignableUsers,
  listPlans,
  type PlanFilters,
} from "@/services/action-plans.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreatePlanDialog, PlanListFilters } from "./plan-dialogs";

export const metadata: Metadata = { title: "Plans d'action" };

const STATUSES = Object.keys(ACTION_PLAN_STATUS_LABELS);

function statusVariant(status: string) {
  switch (status) {
    case "VALIDE":
      return "success" as const;
    case "TERMINE":
      return "info" as const;
    case "EN_COURS":
      return "warning" as const;
    case "ANNULE":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

export default async function PlansActionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "actionplan:read")) return <AccessDenied />;

  const params = await searchParams;
  const stores = await listStores(user);
  const storeId =
    typeof params.boutique === "string" &&
    stores.some((s) => s.id === params.boutique)
      ? params.boutique
      : undefined;
  const status =
    typeof params.statut === "string" && STATUSES.includes(params.statut)
      ? (params.statut as PlanFilters["status"])
      : undefined;

  const canWrite = can(user, "actionplan:write");
  const [plans, assignees] = await Promise.all([
    listPlans(user, { storeId, status }),
    canWrite ? listAssignableUsers(user) : Promise.resolve([]),
  ]);
  const today = todayParis();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plans d&apos;action</h1>
          <p className="text-sm text-muted-foreground">
            Responsable, priorité, échéance, statut — jusqu&apos;à la validation
            finale.
          </p>
        </div>
        {canWrite ? (
          <CreatePlanDialog
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
            assignees={assignees.map((a) => ({
              id: a.id,
              label: `${a.firstName} ${a.lastName}`,
            }))}
          />
        ) : null}
      </div>

      <PlanListFilters
        stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
        current={{ boutique: storeId ?? "", statut: (status as string) ?? "" }}
      />

      <div className="rounded-xl border bg-card">
        <Table data-testid="plans-table">
          <TableHeader>
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Titre</TableHead>
              <TableHead>Boutique</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead>Priorité</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucun plan d&apos;action pour ces filtres.
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => {
                const late = isPlanLate(plan, today);
                return (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <Link
                        href={`/animation/plans-action/${plan.id}`}
                        className="font-mono text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {formatPlanNumber(plan.number)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">{plan.title}</TableCell>
                    <TableCell>{plan.store.code}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {plan.assignee
                        ? `${plan.assignee.firstName} ${plan.assignee.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell>{TICKET_PRIORITY_LABELS[plan.priority]}</TableCell>
                    <TableCell>
                      {plan.dueDate ? (
                        <span className={late ? "font-medium text-destructive" : ""}>
                          {formatDateFr(plan.dueDate)}
                          {late ? " (en retard)" : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(plan.status)}>
                        {ACTION_PLAN_STATUS_LABELS[plan.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
