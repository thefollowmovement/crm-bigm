import "server-only";

import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { employees, fileAttachments, users } from "@/db/schema";
import { auditedInsert, auditedUpdate } from "@/lib/db/audited";
import { ForbiddenError, assertCan, isFranchisorMember } from "@/lib/authz/guards";
import { can } from "@/lib/authz/permissions";
import type { SessionUser } from "@/lib/auth/session";
import { saveUpload } from "@/lib/files/storage";

// Fiches salariés (cdc §12). salaryMonthly et hrNotes sont SENSIBLES :
// retirés du DTO (pas masqués en CSS) pour qui n'a pas hr:read.

type EmployeeRow = typeof employees.$inferSelect;

export type EmployeeDTO = Omit<EmployeeRow, "salaryMonthly" | "hrNotes"> & {
  salaryMonthly?: string | null;
  hrNotes?: string | null;
};

export function toEmployeeDTO(actor: SessionUser, row: EmployeeRow): EmployeeDTO {
  if (can(actor, "hr:read")) return { ...row };
  const dto: EmployeeDTO = { ...row };
  delete dto.salaryMonthly;
  delete dto.hrNotes;
  return dto;
}

// Garde de l'entité FRANCHISEUR : une fiche du siège (storeId null) est
// réservée aux membres de Big M CIE.
function assertHeadquartersAccess(actor: SessionUser, storeId: string | null) {
  if (storeId === null && !isFranchisorMember(actor)) {
    throw new ForbiddenError(
      "Dossier du siège Big M CIE : réservé aux membres de l'entité FRANCHISEUR."
    );
  }
}

export async function listEmployees(
  actor: SessionUser,
  filters: { includeInactive?: boolean } = {}
) {
  assertCan(actor, "hr:read");
  const conditions = [
    filters.includeInactive ? undefined : eq(employees.isActive, true),
    // Les salariés du siège Big M CIE n'apparaissent que pour ses membres.
    isFranchisorMember(actor) ? undefined : isNotNull(employees.storeId),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);
  const rows = await db.query.employees.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    with: {
      store: { columns: { id: true, code: true, name: true } },
      user: { columns: { id: true, email: true } },
    },
    orderBy: [asc(employees.lastName), asc(employees.firstName)],
  });
  return rows;
}

export async function getEmployee(actor: SessionUser, id: string) {
  assertCan(actor, "hr:read");
  const row = await db.query.employees.findFirst({
    where: eq(employees.id, id),
    with: {
      store: { columns: { id: true, code: true, name: true } },
      user: { columns: { id: true, email: true, isActive: true } },
    },
  });
  if (row) assertHeadquartersAccess(actor, row.storeId);
  return row;
}

// Fiche du salarié connecté (mon-espace) — sans salaire ni notes RH.
export async function getMyEmployee(actor: SessionUser) {
  const row = await db.query.employees.findFirst({
    where: eq(employees.userId, actor.id),
    with: { store: { columns: { id: true, code: true, name: true } } },
  });
  if (!row) return null;
  const { store, ...employee } = row;
  return { ...toEmployeeDTO(actor, employee), store };
}

// Comptes liables à une fiche : actifs et pas déjà rattachés.
export async function listLinkableUsers(actor: SessionUser) {
  assertCan(actor, "hr:write");
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .leftJoin(employees, eq(employees.userId, users.id))
    .where(and(isNull(employees.id), eq(users.isActive, true)))
    .orderBy(asc(users.lastName));
  return rows;
}

export type EmployeeInput = {
  firstName: string;
  lastName: string;
  position: string;
  storeId: string | null;
  userId: string | null;
  email: string | null;
  phone: string | null;
  contractType: EmployeeRow["contractType"];
  hireDate: string;
  endDate: string | null;
  salaryMonthly: string | null;
  hrNotes: string | null;
};

async function assertValidInput(input: EmployeeInput, currentId?: string) {
  if (input.endDate && input.endDate < input.hireDate) {
    throw new Error("La date de fin doit être postérieure à l'embauche.");
  }
  if (input.userId) {
    const user = await db.query.users.findFirst({ where: eq(users.id, input.userId) });
    if (!user || !user.isActive) throw new Error("Compte utilisateur invalide.");
    const linked = await db.query.employees.findFirst({
      where: eq(employees.userId, input.userId),
    });
    if (linked && linked.id !== currentId) {
      throw new Error("Ce compte est déjà lié à une autre fiche salarié.");
    }
  }
}

export async function createEmployee(actor: SessionUser, input: EmployeeInput) {
  assertCan(actor, "hr:write");
  assertHeadquartersAccess(actor, input.storeId);
  await assertValidInput(input);
  return auditedInsert({ id: actor.id }, employees, { ...input });
}

export async function updateEmployee(
  actor: SessionUser,
  id: string,
  input: EmployeeInput & { isActive: boolean }
) {
  assertCan(actor, "hr:write");
  const existing = await db.query.employees.findFirst({ where: eq(employees.id, id) });
  if (!existing) throw new Error("Fiche salarié introuvable.");
  assertHeadquartersAccess(actor, existing.storeId);
  assertHeadquartersAccess(actor, input.storeId);
  await assertValidInput(input, id);
  return auditedUpdate({ id: actor.id }, employees, id, { ...input });
}

// ── Dossier RH (pièces jointes contrat, avenants…) ───────────────

export async function attachEmployeeFiles(
  actor: SessionUser,
  employeeId: string,
  files: File[]
) {
  assertCan(actor, "hr:write");
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
  });
  if (!employee) throw new Error("Fiche salarié introuvable.");
  assertHeadquartersAccess(actor, employee.storeId);
  for (const file of files) {
    await saveUpload(actor, file, { entityType: "EMPLOYEE", entityId: employeeId });
  }
}

export async function listEmployeeFiles(actor: SessionUser, employeeId: string) {
  assertCan(actor, "hr:read");
  const employee = await db.query.employees.findFirst({
    where: eq(employees.id, employeeId),
    columns: { storeId: true },
  });
  if (employee) assertHeadquartersAccess(actor, employee.storeId);
  return db.query.fileAttachments.findMany({
    where: and(
      eq(fileAttachments.entityType, "EMPLOYEE"),
      eq(fileAttachments.entityId, employeeId)
    ),
    columns: { id: true, originalName: true, createdAt: true },
  });
}
