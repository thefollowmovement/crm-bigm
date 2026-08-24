import { beforeEach, afterAll, describe, expect, it } from "vitest";

import { pool, db } from "@/lib/db/client";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { canDownloadFile } from "@/lib/files/access";
import {
  attachEmployeeFiles,
  createEmployee,
  getEmployee,
  listEmployees,
  updateEmployee,
  type EmployeeInput,
} from "@/services/employees.service";
import { decideLeave, listLeaves, requestLeave } from "@/services/leaves.service";
import { resetDb } from "./setup/reset-db";
import { createTestStore, createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
  franchisorMember: boolean;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    pole: user.pole,
    franchiseeId: user.franchiseeId,
    franchisorMember: user.franchisorMember,
  };
}

function baseEmployee(): EmployeeInput {
  return {
    firstName: "Séverine",
    lastName: "Siège",
    position: "Assistante de direction",
    storeId: null,
    userId: null,
    email: null,
    phone: null,
    contractType: "CDI",
    hireDate: "2024-01-08",
    endDate: null,
    salaryMonthly: null,
    hrNotes: null,
  };
}

describe("entité FRANCHISEUR — dossiers RH du siège Big M CIE", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("créer/voir/modifier une fiche du siège : membres de l'entité uniquement", async () => {
    const membre = asSession(
      await createTestUser({ role: "RH", pole: "RH", franchisorMember: true })
    );
    const nonMembre = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const admin = asSession(await createTestUser({ role: "ADMIN" }));
    const store = await createTestStore();

    // Un non-membre ne crée pas de fiche au siège (mais peut en boutique).
    await expect(createEmployee(nonMembre, baseEmployee())).rejects.toThrow(
      ForbiddenError
    );
    await createEmployee(nonMembre, {
      ...baseEmployee(),
      firstName: "Bob",
      storeId: store.id,
    });

    const siege = await createEmployee(membre, baseEmployee());

    // Liste : filtrée pour le non-membre, complète pour membre et ADMIN.
    expect((await listEmployees(nonMembre)).map((e) => e.id)).not.toContain(siege.id);
    expect((await listEmployees(membre)).map((e) => e.id)).toContain(siege.id);
    expect((await listEmployees(admin)).map((e) => e.id)).toContain(siege.id);

    // Fiche et modification refusées au non-membre.
    await expect(getEmployee(nonMembre, siege.id)).rejects.toThrow(ForbiddenError);
    await expect(
      updateEmployee(nonMembre, siege.id, {
        ...baseEmployee(),
        position: "Autre",
        isActive: true,
      })
    ).rejects.toThrow(ForbiddenError);

    // Un membre ne peut pas non plus « sortir » une fiche boutique vers le
    // siège à l'insu d'un non-membre… mais lui a le droit dans les deux sens.
    await updateEmployee(membre, siege.id, {
      ...baseEmployee(),
      position: "Directrice de cabinet",
      isActive: true,
    });
  });

  it("congés du siège : filtrés et tranchés par les membres seulement", async () => {
    const membre = asSession(
      await createTestUser({ role: "RH", pole: "RH", franchisorMember: true })
    );
    const nonMembre = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const compteSiege = await createTestUser({ role: "SALARIE" });

    const siege = await createEmployee(membre, {
      ...baseEmployee(),
      userId: compteSiege.id,
    });

    // Le non-membre ne peut pas saisir POUR un salarié du siège…
    await expect(
      requestLeave(nonMembre, {
        employeeId: siege.id,
        type: "CONGES_PAYES",
        startDate: "2026-09-01",
        endDate: "2026-09-05",
        comment: null,
      })
    ).rejects.toThrow(ForbiddenError);

    // …mais le salarié du siège demande pour LUI-MÊME sans être membre.
    const leave = await requestLeave(asSession(compteSiege), {
      type: "CONGES_PAYES",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      comment: null,
    });

    // Liste RH : la demande du siège est invisible du non-membre.
    expect((await listLeaves(nonMembre)).map((l) => l.id)).not.toContain(leave.id);
    expect((await listLeaves(membre)).map((l) => l.id)).toContain(leave.id);

    // Décision : refusée au non-membre, permise au membre.
    await expect(decideLeave(nonMembre, leave.id, "VALIDEE")).rejects.toThrow(
      ForbiddenError
    );
    const decided = await decideLeave(membre, leave.id, "VALIDEE");
    expect(decided.status).toBe("VALIDEE");
  });

  it("pièces jointes du dossier siège : membre ou salarié lui-même", async () => {
    const membre = asSession(
      await createTestUser({ role: "RH", pole: "RH", franchisorMember: true })
    );
    const nonMembre = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const compteSiege = await createTestUser({ role: "SALARIE" });

    const siege = await createEmployee(membre, {
      ...baseEmployee(),
      userId: compteSiege.id,
    });
    await attachEmployeeFiles(membre, siege.id, [
      new File([Buffer.from("%PDF-1.4\n")], "contrat.pdf", {
        type: "application/pdf",
      }),
    ]);
    await expect(attachEmployeeFiles(nonMembre, siege.id, [])).rejects.toThrow(
      ForbiddenError
    );

    const attachment = await db.query.fileAttachments.findFirst({
      where: (f, { eq }) => eq(f.entityType, "EMPLOYEE"),
    });
    expect(attachment).toBeDefined();
    expect((await canDownloadFile(membre, attachment!)).allowed).toBe(true);
    expect((await canDownloadFile(nonMembre, attachment!)).allowed).toBe(false);
    // Le salarié du siège télécharge son propre dossier.
    expect((await canDownloadFile(asSession(compteSiege), attachment!)).allowed).toBe(
      true
    );
  });
});
