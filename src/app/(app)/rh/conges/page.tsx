import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/labels";
import { listEmployees } from "@/services/employees.service";
import { listLeaves } from "@/services/leaves.service";
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

import {
  CreateLeaveDialog,
  DecideLeaveButtons,
  LeaveStatusFilter,
} from "./leave-components";

export const metadata: Metadata = { title: "Congés" };

const STATUSES = Object.keys(LEAVE_STATUS_LABELS);
type LeaveStatus = "DEMANDEE" | "VALIDEE" | "REFUSEE" | "ANNULEE";

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

  const canWrite = can(user, "hr:write");
  const [leaves, employees] = await Promise.all([
    listLeaves(user, { status }),
    canWrite ? listEmployees(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Congés</h1>
          <p className="text-sm text-muted-foreground">
            Demandes des salariés : validation ou refus par la RH.
          </p>
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
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
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
                    du {formatDateFr(leave.startDate)} au {formatDateFr(leave.endDate)}
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
    </div>
  );
}
