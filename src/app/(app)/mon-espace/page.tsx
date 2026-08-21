import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addDaysIso, formatDateFr, todayParis } from "@/lib/dates";
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/labels";
import { getMyEmployee } from "@/services/employees.service";
import { listLeaves } from "@/services/leaves.service";
import {
  formatMinutes,
  getMyClockDay,
  getTimesheet,
} from "@/services/timeclock.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CancelMyLeaveButton,
  ClockButtons,
  MyLeaveForm,
} from "./espace-components";

export const metadata: Metadata = { title: "Mon espace" };

const CLOCK_STATE_LABELS: Record<string, string> = {
  TRAVAIL: "Au travail",
  PAUSE: "En pause",
};

export default async function MonEspacePage() {
  const user = await requireUser();
  if (!can(user, "self:clock") && !can(user, "self:leave")) return <AccessDenied />;

  const employee = await getMyEmployee(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mon espace</h1>
        <p className="text-sm text-muted-foreground">
          Pointeuse, heures travaillées et demandes de congés.
        </p>
      </div>

      {!employee ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Aucune fiche salarié n&apos;est liée à votre compte. Contactez la RH.
          </CardContent>
        </Card>
      ) : (
        <MonEspaceContent />
      )}
    </div>
  );
}

async function MonEspaceContent() {
  const user = await requireUser();
  const today = todayParis();
  const [day, leaves] = await Promise.all([
    getMyClockDay(user),
    listLeaves(user),
  ]);
  const timesheet = await getTimesheet(user, {
    employeeId: day.employeeId,
    from: addDaysIso(today, -6),
    to: today,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Pointeuse</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge
                variant={day.open ? "success" : "secondary"}
                data-testid="clock-state"
              >
                {day.open
                  ? (CLOCK_STATE_LABELS[day.open.type] ?? day.open.type)
                  : "Journée non commencée"}
              </Badge>
              <span className="text-sm text-muted-foreground" data-testid="clock-total">
                Aujourd&apos;hui : {formatMinutes(day.workedMinutes)} travaillées
                {day.pauseMinutes > 0
                  ? ` · ${formatMinutes(day.pauseMinutes)} de pause`
                  : ""}
              </span>
            </div>
            <ClockButtons actions={day.actions} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes heures (7 derniers jours)</CardTitle>
          </CardHeader>
          <CardContent>
            {timesheet.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun pointage.</p>
            ) : (
              <Table data-testid="my-timesheet">
                <TableHeader>
                  <TableRow>
                    <TableHead>Jour</TableHead>
                    <TableHead>Travail</TableHead>
                    <TableHead>Pause</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timesheet.map((row) => (
                    <TableRow key={row.day}>
                      <TableCell>{formatDateFr(row.day)}</TableCell>
                      <TableCell>{formatMinutes(row.workedMinutes)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatMinutes(row.pauseMinutes)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Demander des congés</CardTitle>
          </CardHeader>
          <CardContent>
            <MyLeaveForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mes demandes</CardTitle>
          </CardHeader>
          <CardContent>
            {leaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune demande.</p>
            ) : (
              <ul className="space-y-2 text-sm" data-testid="my-leaves">
                {leaves.map((leave) => (
                  <li key={leave.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      {LEAVE_TYPE_LABELS[leave.type]} · du{" "}
                      {formatDateFr(leave.startDate)} au {formatDateFr(leave.endDate)}
                    </span>
                    <Badge
                      variant={
                        leave.status === "VALIDEE"
                          ? "success"
                          : leave.status === "REFUSEE"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {LEAVE_STATUS_LABELS[leave.status]}
                    </Badge>
                    {leave.status === "DEMANDEE" ? (
                      <CancelMyLeaveButton leaveId={leave.id} />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
