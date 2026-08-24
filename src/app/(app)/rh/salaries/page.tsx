import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { isFranchisorMember } from "@/lib/authz/guards";
import { formatDateFr } from "@/lib/dates";
import { EMPLOYEE_CONTRACT_TYPE_LABELS } from "@/lib/labels";
import {
  listEmployees,
  listLinkableUsers,
} from "@/services/employees.service";
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

import { CreateEmployeeDialog } from "./employee-components";

export const metadata: Metadata = { title: "Salariés" };

export default async function EmployeesPage() {
  const user = await requireUser();
  if (!can(user, "hr:read")) return <AccessDenied />;

  const canWrite = can(user, "hr:write");
  const [employees, stores, linkableUsers] = await Promise.all([
    listEmployees(user, { includeInactive: true }),
    listStores(user),
    canWrite ? listLinkableUsers(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Salariés</h1>
          <p className="text-sm text-muted-foreground">
            Dossiers RH : contrats, affectations, congés et temps de travail.
          </p>
        </div>
        {canWrite ? (
          <CreateEmployeeDialog
            canHeadquarters={isFranchisorMember(user)}
            stores={stores.map((s) => ({ id: s.id, label: `${s.code} — ${s.name}` }))}
            linkableUsers={linkableUsers.map((u) => ({
              id: u.id,
              label: `${u.firstName} ${u.lastName} (${u.email})`,
            }))}
          />
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="employees-table">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Poste</TableHead>
              <TableHead>Affectation</TableHead>
              <TableHead>Contrat</TableHead>
              <TableHead>Embauche</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun salarié.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((employee) => (
                <TableRow key={employee.id}>
                  <TableCell>
                    <Link
                      href={`/rh/salaries/${employee.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {employee.firstName} {employee.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{employee.position}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {employee.store
                      ? `${employee.store.code} — ${employee.store.name}`
                      : "Siège — Big M CIE"}
                  </TableCell>
                  <TableCell>
                    {EMPLOYEE_CONTRACT_TYPE_LABELS[employee.contractType]}
                  </TableCell>
                  <TableCell>{formatDateFr(employee.hireDate)}</TableCell>
                  <TableCell>
                    <Badge variant={employee.isActive ? "success" : "secondary"}>
                      {employee.isActive ? "Actif" : "Sorti"}
                    </Badge>
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
