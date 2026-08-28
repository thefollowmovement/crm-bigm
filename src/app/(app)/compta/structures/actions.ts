"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/current-user";
import { ForbiddenError, assertCan } from "@/lib/authz/guards";
import { nullable, safeFormAction } from "@/lib/actions/safe-action";
import {
  createStructure,
  importStructures,
  updateStructure,
} from "@/services/acct-structures.service";
import { createProviderAccount } from "@/services/providers.service";

const amountString = z
  .string()
  .trim()
  .regex(/^-?\d{1,10}(?:[.,]\d{1,2})?$/, "Montant invalide (ex. 1234,56)")
  .transform((v) => v.replace(",", "."));

const structureSchema = z.object({
  code: z.string().trim().min(1, "Code requis"),
  name: z.string().trim().min(1, "Nom requis"),
  company: z.string().trim().nullable(),
  contactName: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  email: z.string().trim().email("E-mail invalide").nullable(),
  creditAvailable: amountString.nullable(),
  address: z.string().trim().nullable(),
  postalCode: z.string().trim().nullable(),
  city: z.string().trim().nullable(),
  vatNumber: z.string().trim().nullable(),
  siret: z.string().trim().nullable(),
  type: z.enum([
    "BOUTIQUE",
    "TAWILA",
    "DPS",
    "TFM",
    "FOURNISSEUR",
    "PARTENAIRE",
    "AUTRE",
  ]),
  storeId: z.string().uuid().nullable(),
  notes: z.string().trim().nullable(),
});

function prepareStructure(formData: FormData) {
  return {
    code: formData.get("code"),
    name: formData.get("name"),
    company: nullable(formData.get("company")),
    contactName: nullable(formData.get("contactName")),
    phone: nullable(formData.get("phone")),
    email: nullable(formData.get("email")),
    creditAvailable: nullable(formData.get("creditAvailable")),
    address: nullable(formData.get("address")),
    postalCode: nullable(formData.get("postalCode")),
    city: nullable(formData.get("city")),
    vatNumber: nullable(formData.get("vatNumber")),
    siret: nullable(formData.get("siret")),
    type: formData.get("type"),
    storeId: nullable(formData.get("storeId")),
    notes: nullable(formData.get("notes")),
  };
}

export const createStructureAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: structureSchema,
    prepare: prepareStructure,
  },
  async (input, actor) => {
    await createStructure(actor, input);
    revalidatePath("/compta/structures");
    return "Structure créée.";
  }
);

export const updateStructureAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: structureSchema.extend({ id: z.string().uuid() }),
    prepare: (formData) => ({
      ...prepareStructure(formData),
      id: formData.get("id"),
    }),
  },
  async ({ id, ...input }, actor) => {
    await updateStructure(actor, id, input);
    revalidatePath("/compta/structures");
    return "Structure mise à jour.";
  }
);

export const toggleStructureAction = safeFormAction(
  {
    permission: "accounting:write",
    schema: z.object({
      id: z.string().uuid(),
      isActive: z.enum(["true", "false"]),
    }),
  },
  async (input, actor) => {
    await updateStructure(actor, input.id, {
      isActive: input.isActive === "true",
    });
    revalidatePath("/compta/structures");
    return input.isActive === "true"
      ? "Structure réactivée."
      : "Structure désactivée.";
  }
);

// ── Import du référentiel (rapport détaillé retourné à l'écran) ──

export type StructureImportState = {
  error?: string;
  report?: {
    fileName: string;
    format: string;
    totalRows: number;
    created: number;
    updated: number;
    skipped: number;
    errors: { line: number; message: string }[];
  };
};

export async function importStructuresAction(
  _prev: StructureImportState,
  formData: FormData
): Promise<StructureImportState> {
  const actor = await requireUser();
  try {
    assertCan(actor, "accounting:import");
  } catch (e) {
    return { error: e instanceof ForbiddenError ? e.message : "Accès refusé." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisissez un fichier (.xlsx, .xls, .xlsb ou .csv)." };
  }
  const mode =
    formData.get("mode") === "METTRE_A_JOUR" ? "METTRE_A_JOUR" : "IGNORER";
  try {
    const report = await importStructures(actor, file, mode);
    revalidatePath("/compta/structures");
    return {
      report: {
        fileName: report.fileName,
        format: report.format,
        totalRows: report.totalRows,
        created: report.createdRows,
        updated: report.updatedRows,
        skipped: report.skippedRows,
        errors: (report.errors ?? []) as { line: number; message: string }[],
      },
    };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Erreur pendant l'import.",
    };
  }
}

// Accès CRM d'un prestataire externe (étape 53) : compte rôle PRESTATAIRE
// rattaché à la structure — réservé à user:manage (délégable via
// /hq-18b8ba/permissions).
export const createProviderAccountAction = safeFormAction(
  {
    permission: "user:manage",
    schema: z.object({
      structureId: z.string().uuid(),
      email: z.string().trim().email("E-mail invalide"),
      password: z
        .string()
        .min(10, "Mot de passe : 10 caractères minimum"),
      firstName: z.string().trim().min(1, "Prénom requis"),
      lastName: z.string().trim().min(1, "Nom requis"),
    }),
    prepare: (formData) => ({
      structureId: formData.get("structureId"),
      email: formData.get("email"),
      password: formData.get("password"),
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
    }),
  },
  async ({ structureId, ...input }, actor) => {
    const account = await createProviderAccount(actor, structureId, input);
    revalidatePath(`/compta/structures/${structureId}`);
    return `Accès prestataire créé pour ${account.email}.`;
  }
);
