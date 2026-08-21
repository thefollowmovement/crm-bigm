import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { addDaysIso, formatDateFr, todayParis } from "@/lib/dates";
import { EMPLOYEE_CONTRACT_TYPE_LABELS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS } from "@/lib/labels";
import {
  getEmployee,
  listEmployeeFiles,
  listLinkableUsers,
} from "@/services/employees.service";
import { listLeaves } from "@/services/leaves.service";
import { formatMinutes, getTimesheet } from "@/services/timeclock.service";
import { listStores } from "@/services/stores.service";
import { AccessDenied } from "@/components/access-denied";
import { EntityHistory } from "@/components/entity-history";
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

import { EditEmployeeForm, EmployeeDocsForm } from "../employee-components";
import { DecideLeaveButtons } from "../../conges/leave-components";

export const metadata: Metadata = { title: "Fiche salarié" };

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "hr:read")) return <AccessDenied />;

  const { id } = await params;
  const employee = await getEmployee(user, id);
  if (!employee) notFound();

  const canWrite = can(user, "hr:write");
  const today = todayParis();
  const [stores, linkable, leaves, files, timesheet] = await Promise.all([
    canWrite ? listStores(user) : Promise.resolve([]),
    canWrite ? listLinkableUsers(user) : Promise.resolve([]),
    listLeaves(user, { employeeId: employee.id }),
    listEmployeeFiles(user, employee.id),
    getTimesheet(user, {
      employeeId: employee.id,
      from: addDaysIso(today, -13),
      to: today,
    }),
  ]);

  // Le compte déjà lié à CETTE fiche doit rester proposé dans le select.
  const linkableUsers = [
    ...(employee.user
      ? [{ id: employee.user.id, label: `${employee.firstName} ${employee.lastName} (${employee.user.email})` }]
      : []),
    ...linkable.map((u) => ({
      id: u.id,
      label: `${u.firstName} ${u.lastName} (${u.email})`,
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold" data-testid="employee-title">
          {employee.firstName} {employee.lastName}
        </h1>
        <Badge variant="secondary">{employee.position}</Badge>
        <Badge variant={employee.isActive ? "success" : "outline"}>
          {employee.isActive ? "Actif" : "Sorti"}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dossier</CardTitle>
          </CardHeader>
          <CardContent>
            {canWrite ? (
              <EditEmployeeForm
                employeeId={employee.id}
                isActive={employee.isActive}
                stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
                linkableUsers={linkableUsers}
                values={{
                  firstName: employee.firstName,
                  lastName: employee.lastName,
                  position: employee.position,
                  storeId: employee.storeId,
                  userId: employee.userId,
                  email: employee.email,
                  phone: employee.phone,
                  contractType: employee.contractType,
                  hireDate: employee.hireDate,
                  endDate: employee.endDate,
                  salaryMonthly: employee.salaryMonthly,
                  hrNotes: employee.hrNotes,
                }}
              />
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2 text-sm" data-testid="employee-info">
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Contrat</dt>
                  <dd>{EMPLOYEE_CONTRACT_TYPE_LABELS[employee.contractType]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-muted-foreground">Embauche</dt>
                  <dd>{formatDateFr(employee.hireDate)}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Temps de travail (14 derniers jours)</CardTitle>
            </CardHeader>
            <CardContent>
              {timesheet.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun pointage.</p>
              ) : (
                <Table data-testid="employee-timesheet">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Jour</TableHead>
                      <TableHead>Travail</TableHead>
                      <TableHead>Pause</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {timesheet.map((day) => (
                      <TableRow key={day.day}>
                        <TableCell>{formatDateFr(day.day)}</TableCell>
                        <TableCell>{formatMinutes(day.workedMinutes)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatMinutes(day.pauseMinutes)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Congés</CardTitle>
            </CardHeader>
            <CardContent>
              {leaves.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune demande.</p>
              ) : (
                <ul className="space-y-2 text-sm" data-testid="employee-leaves">
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
                      {canWrite && leave.status === "DEMANDEE" ? (
                        <DecideLeaveButtons leaveId={leave.id} />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents du dossier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {files.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun document.</p>
              ) : (
                <ul className="list-inside list-disc text-sm" data-testid="employee-docs">
                  {files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/files/${file.id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {file.originalName}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite ? <EmployeeDocsForm employeeId={employee.id} /> : null}
            </CardContent>
          </Card>

          <EntityHistory user={user} tableName="employees" recordId={employee.id} />
        </div>
      </div>
    </div>
  );
}
