import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { clockEntries, notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createEmployee,
  getMyEmployee,
  listEmployees,
  toEmployeeDTO,
  updateEmployee,
} from "@/services/employees.service";
import {
  cancelLeave,
  decideLeave,
  listLeaves,
  requestLeave,
} from "@/services/leaves.service";
import { clock, getMyClockDay, getTimesheet } from "@/services/timeclock.service";
import { todayParis } from "@/lib/dates";
import { resetDb } from "./setup/reset-db";
import { createTestEmployee, createTestUser } from "../helpers/factories";

function asSession(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: SessionUser["role"];
  pole: SessionUser["pole"];
  franchiseeId: string | null;
}): SessionUser {
  return { ...user };
}

afterAll(async () => {
  await pool.end();
});

describe("RH — salariés, congés, pointeuse", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("fiche salarié : champs sensibles réservés à hr:read, écriture réservée à la RH", async () => {
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    const employee = await createEmployee(rh, {
      firstName: "Nora",
      lastName: "Essai",
      position: "Manager",
      storeId: null,
      userId: null,
      email: null,
      phone: null,
      contractType: "CDI",
      hireDate: "2025-02-03",
      endDate: null,
      salaryMonthly: "2300.00",
      hrNotes: "Augmentation prévue (confidentiel).",
    });

    // DTO : le salaire et les notes disparaissent sans hr:read.
    const forRh = toEmployeeDTO(rh, employee);
    expect(forRh.salaryMonthly).toBe("2300.00");
    const forAnimateur = toEmployeeDTO(animateur, employee);
    expect("salaryMonthly" in forAnimateur).toBe(false);
    expect("hrNotes" in forAnimateur).toBe(false);

    // Lecture liste et écriture interdites hors RH/direction.
    await expect(listEmployees(animateur)).rejects.toThrow(ForbiddenError);
    await expect(
      createEmployee(animateur, {
        firstName: "X",
        lastName: "X",
        position: "X",
        storeId: null,
        userId: null,
        email: null,
        phone: null,
        contractType: "CDI",
        hireDate: "2025-01-01",
        endDate: null,
        salaryMonthly: null,
        hrNotes: null,
      })
    ).rejects.toThrow(ForbiddenError);

    // Un compte ne peut pas être lié à deux fiches.
    const compte = await createTestUser({ role: "SALARIE" });
    await updateEmployee(rh, employee.id, {
      firstName: employee.firstName,
      lastName: employee.lastName,
      position: employee.position,
      storeId: null,
      userId: compte.id,
      email: null,
      phone: null,
      contractType: "CDI",
      hireDate: employee.hireDate,
      endDate: null,
      salaryMonthly: null,
      hrNotes: null,
      isActive: true,
    });
    const second = await createTestEmployee();
    await expect(
      updateEmployee(rh, second.id, {
        firstName: second.firstName,
        lastName: second.lastName,
        position: second.position,
        storeId: null,
        userId: compte.id,
        email: null,
        phone: null,
        contractType: second.contractType,
        hireDate: second.hireDate,
        endDate: null,
        salaryMonthly: null,
        hrNotes: null,
        isActive: true,
      })
    ).rejects.toThrow(/déjà lié/);
  });

  it("congés : demande du salarié, refus des chevauchements, décision RH notifiée, annulation", async () => {
    const rh = asSession(await createTestUser({ role: "RH", pole: "RH" }));
    const compte = await createTestUser({ role: "SALARIE" });
    const salarie = asSession(compte);
    await createTestEmployee({ userId: compte.id });

    const leave = await requestLeave(salarie, {
      type: "CONGES_PAYES",
      startDate: "2026-09-07",
      endDate: "2026-09-11",
      comment: null,
    });
    expect(leave.status).toBe("DEMANDEE");
    // La RH est notifiée de la demande.
    const rhNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, rh.id),
    });
    expect(rhNotifs.some((n) => n.type === "RH")).toBe(true);

    // Chevauchement refusé.
    await expect(
      requestLeave(salarie, {
        type: "SANS_SOLDE",
        startDate: "2026-09-11",
        endDate: "2026-09-14",
        comment: null,
      })
    ).rejects.toThrow(/chevauche/);

    // Fin avant début refusée.
    await expect(
      requestLeave(salarie, {
        type: "CONGES_PAYES",
        startDate: "2026-10-10",
        endDate: "2026-10-01",
        comment: null,
      })
    ).rejects.toThrow(/postérieure/);

    // Le salarié ne tranche pas ; la RH valide et le salarié est notifié.
    await expect(decideLeave(salarie, leave.id, "VALIDEE")).rejects.toThrow(
      ForbiddenError
    );
    const decided = await decideLeave(rh, leave.id, "VALIDEE", "Bon repos !");
    expect(decided.status).toBe("VALIDEE");
    const salarieNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, compte.id),
    });
    expect(salarieNotifs.some((n) => n.type === "RH")).toBe(true);

    // Déjà tranchée : plus annulable par le salarié, mais la RH peut.
    await expect(cancelLeave(salarie, leave.id)).rejects.toThrow(ForbiddenError);
    const cancelled = await cancelLeave(rh, leave.id);
    expect(cancelled.status).toBe("ANNULEE");

    // Le salarié ne voit que SES demandes.
    await createTestEmployee(); // autre salarié sans lien
    const mine = await listLeaves(salarie);
    expect(mine).toHaveLength(1);
    expect(mine[0].id).toBe(leave.id);
  });

  it("pointeuse : cycle complet, un seul badge ouvert, feuille de temps", async () => {
    const compte = await createTestUser({ role: "SALARIE" });
    const salarie = asSession(compte);
    const employee = await createTestEmployee({ userId: compte.id });

    await clock(salarie, "DEBUT");
    // Re-DEBUT impossible tant qu'un badge est ouvert.
    await expect(clock(salarie, "DEBUT")).rejects.toThrow(/impossible/);

    await clock(salarie, "PAUSE");
    await clock(salarie, "REPRISE");
    await clock(salarie, "FIN");

    // Plus aucun badge ouvert ; 3 intervalles enregistrés (2 travail + 1 pause).
    const openRows = await db
      .select()
      .from(clockEntries)
      .where(
        and(eq(clockEntries.employeeId, employee.id), isNull(clockEntries.endedAt))
      );
    expect(openRows).toHaveLength(0);

    const day = await getMyClockDay(salarie);
    expect(day.entries).toHaveLength(3);
    expect(day.open).toBeNull();
    expect(day.actions).toEqual(["DEBUT"]);

    const today = todayParis();
    const sheet = await getTimesheet(salarie, {
      employeeId: employee.id,
      from: today,
      to: today,
    });
    expect(sheet).toHaveLength(1);

    // Un autre salarié ne lit pas la feuille de temps d'autrui.
    const autreCompte = await createTestUser({ role: "SALARIE" });
    await createTestEmployee({ userId: autreCompte.id });
    await expect(
      getTimesheet(asSession(autreCompte), {
        employeeId: employee.id,
        from: today,
        to: today,
      })
    ).rejects.toThrow(ForbiddenError);

    // Sans fiche liée : pointage impossible.
    const sansFiche = asSession(await createTestUser({ role: "SALARIE" }));
    await expect(clock(sansFiche, "DEBUT")).rejects.toThrow(/Aucune fiche/);
    expect(await getMyEmployee(sansFiche)).toBeNull();
  });
});
