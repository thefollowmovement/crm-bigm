"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  attachEmployeeFiles,
  createEmployee,
  updateEmployee,
} from "@/services/employees.service";
import { decideLeave, cancelLeave, requestLeave } from "@/services/leaves.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");
const amountString = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

// Arrow functions hissées en consts module : jamais d'arrow inline dans un
// schéma Zod au niveau d'un export (« Server Actions must be async functions »).
const isFile = (v: unknown) => v instanceof File;
const filesField = z.array(z.custom<File>(isFile)).min(1, "Fichier requis");
const boolString = z.enum(["true", "false"]).transform((v) => v === "true");

const contractTypeSchema = z.enum(["CDI", "CDD", "APPRENTISSAGE", "STAGE", "EXTRA"]);
const leaveTypeSchema = z.enum([
  "CONGES_PAYES",
  "SANS_SOLDE",
  "MALADIE",
  "FAMILIAL",
  "AUTRE",
]);

const employeeFields = z.object({
  firstName: z.string().trim().min(1, "Prénom requis"),
  lastName: z.string().trim().min(1, "Nom requis"),
  position: z.string().trim().min(1, "Poste requis"),
  storeId: z.string().uuid().nullable(),
  userId: z.string().uuid().nullable(),
  email: z.string().email("E-mail invalide").nullable(),
  phone: z.string().nullable(),
  contractType: contractTypeSchema,
  hireDate: dateString,
  endDate: dateString.nullable(),
  salaryMonthly: amountString.nullable(),
  hrNotes: z.string().trim().nullable(),
});

function prepareEmployee(formData: FormData) {
  return {
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    position: formData.get("position"),
    storeId: nullable(formData.get("storeId")),
    userId: nullable(formData.get("userId")),
    email: nullable(formData.get("email")),
    phone: nullable(formData.get("phone")),
    contractType: formData.get("contractType"),
    hireDate: formData.get("hireDate"),
    endDate: nullable(formData.get("endDate")),
    salaryMonthly: nullable(formData.get("salaryMonthly")),
    hrNotes: nullable(formData.get("hrNotes")),
  };
}

export const createEmployeeAction = safeFormAction(
  {
    permission: "hr:write",
    schema: employeeFields,
    prepare: prepareEmployee,
  },
  async (input, actor) => {
    await createEmployee(actor, input);
    revalidatePath("/rh/salaries");
    return "Fiche salarié créée.";
  }
);

export const updateEmployeeAction = safeFormAction(
  {
    permission: "hr:write",
    schema: employeeFields.extend({
      employeeId: z.string().uuid(),
      isActive: boolString,
    }),
    prepare: (formData) => ({
      ...prepareEmployee(formData),
      employeeId: formData.get("employeeId"),
      isActive: formData.get("isActive") ?? "true",
    }),
  },
  async (input, actor) => {
    const { employeeId, ...fields } = input;
    await updateEmployee(actor, employeeId, fields);
    revalidatePath(`/rh/salaries/${employeeId}`);
    revalidatePath("/rh/salaries");
    return "Fiche salarié mise à jour.";
  }
);

export const uploadEmployeeFilesAction = safeFormAction(
  {
    permission: "hr:write",
    schema: z.object({
      employeeId: z.string().uuid(),
      files: filesField,
    }),
    prepare: (formData) => ({
      employeeId: formData.get("employeeId"),
      files: formData
        .getAll("files")
        .filter((f): f is File => f instanceof File && f.size > 0),
    }),
  },
  async (input, actor) => {
    await attachEmployeeFiles(actor, input.employeeId, input.files);
    revalidatePath(`/rh/salaries/${input.employeeId}`);
    return "Document ajouté au dossier.";
  }
);

export const requestLeaveForEmployeeAction = safeFormAction(
  {
    permission: "hr:write",
    schema: z.object({
      employeeId: z.string().uuid("Choisissez un salarié"),
      type: leaveTypeSchema,
      startDate: dateString,
      endDate: dateString,
      comment: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      employeeId: nullable(formData.get("employeeId")),
      type: formData.get("type"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      comment: nullable(formData.get("comment")),
    }),
  },
  async (input, actor) => {
    await requestLeave(actor, input);
    revalidatePath("/rh/conges");
    return "Demande de congés enregistrée.";
  }
);

export const decideLeaveAction = safeFormAction(
  {
    permission: "hr:write",
    schema: z.object({
      leaveId: z.string().uuid(),
      decision: z.enum(["VALIDEE", "REFUSEE"]),
      comment: z.string().trim().nullable(),
    }),
    prepare: (formData) => ({
      leaveId: formData.get("leaveId"),
      decision: formData.get("decision"),
      comment: nullable(formData.get("comment")),
    }),
  },
  async (input, actor) => {
    await decideLeave(actor, input.leaveId, input.decision, input.comment);
    revalidatePath("/rh/conges");
    return input.decision === "VALIDEE" ? "Demande validée." : "Demande refusée.";
  }
);

export const cancelLeaveAction = safeFormAction(
  {
    // pas de permission unique : le service tranche (salarié OU RH)
    schema: z.object({ leaveId: z.string().uuid() }),
  },
  async (input, actor) => {
    await cancelLeave(actor, input.leaveId);
    revalidatePath("/rh/conges");
    revalidatePath("/mon-espace");
    return "Demande annulée.";
  }
);
