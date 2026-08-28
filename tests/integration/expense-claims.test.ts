import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  countClaimsToProcess,
  createExpenseClaim,
  decideExpenseClaim,
  listClaimsForAccounting,
  listVisitClaims,
  markClaimReimbursed,
} from "@/services/expense-claims.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestStore,
  createTestUser,
  createTestVisit,
} from "../helpers/factories";

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

describe("notes de frais des visites (étape 54)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("cycle complet : saisie → validation direction → remboursement compta", async () => {
    const animateur = asSession(
      await createTestUser({ role: "ANIMATION", pole: "ANIMATION" })
    );
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const store = await createTestStore();
    const visit = await createTestVisit(store.id, {
      visitedById: animateur.id,
    });

    const claim = await createExpenseClaim(animateur, visit.id, {
      title: "VHR — déplacement",
      amountTTC: "45.90",
      note: "Aller-retour Lyon",
    });
    expect(claim.status).toBe("DEMANDE");

    // La direction a été notifiée de la demande.
    const directionNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, direction.id),
    });
    expect(directionNotifs.some((n) => n.title.includes("à valider"))).toBe(true);

    // Montant invalide refusé.
    await expect(
      createExpenseClaim(animateur, visit.id, {
        title: "Zéro",
        amountTTC: "0.00",
        note: null,
      })
    ).rejects.toThrow(/supérieur à zéro/);

    // L'animateur ne valide pas lui-même.
    await expect(
      decideExpenseClaim(animateur, claim.id, true)
    ).rejects.toThrow(ForbiddenError);

    // La direction valide → la compta est notifiée, le compteur passe à 1.
    const validated = await decideExpenseClaim(direction, claim.id, true);
    expect(validated.status).toBe("VALIDEE");
    expect(validated.decidedById).toBe(direction.id);
    const comptaNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, compta.id),
    });
    expect(comptaNotifs.some((n) => n.title.includes("à rembourser"))).toBe(true);
    expect(await countClaimsToProcess(compta)).toBe(1);
    // Sans accounting:read, le compteur reste muet.
    expect(await countClaimsToProcess(animateur)).toBe(0);

    // Une note déjà traitée ne se revalide pas.
    await expect(decideExpenseClaim(direction, claim.id, false)).rejects.toThrow(
      /déjà été traitée/
    );

    // La compta rembourse ; l'auteur est notifié ; le compteur retombe.
    const queue = await listClaimsForAccounting(compta, { status: "VALIDEE" });
    expect(queue.map((c) => c.id)).toContain(claim.id);
    const reimbursed = await markClaimReimbursed(compta, claim.id);
    expect(reimbursed.status).toBe("REMBOURSEE");
    expect(await countClaimsToProcess(compta)).toBe(0);
    const authorNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, animateur.id),
    });
    expect(authorNotifs.some((n) => n.title.includes("remboursée"))).toBe(true);

    // Une note remboursée ne se rembourse pas deux fois.
    await expect(markClaimReimbursed(compta, claim.id)).rejects.toThrow(
      /Seule une note validée/
    );

    const visitClaims = await listVisitClaims(animateur, visit.id);
    expect(visitClaims).toHaveLength(1);
    expect(visitClaims[0].status).toBe("REMBOURSEE");
  });

  it("refus : statut REFUSEE, l'auteur est prévenu, rien pour la compta", async () => {
    const animateur = asSession(
      await createTestUser({ role: "ANIMATION", pole: "ANIMATION" })
    );
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    const store = await createTestStore();
    const visit = await createTestVisit(store.id, { visitedById: animateur.id });
    const claim = await createExpenseClaim(animateur, visit.id, {
      title: "Repas non justifié",
      amountTTC: "80.00",
      note: null,
    });

    const refused = await decideExpenseClaim(direction, claim.id, false);
    expect(refused.status).toBe("REFUSEE");
    expect(await countClaimsToProcess(compta)).toBe(0);
    const authorNotifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, animateur.id),
    });
    expect(authorNotifs.some((n) => n.title.includes("refusée"))).toBe(true);
  });
});
