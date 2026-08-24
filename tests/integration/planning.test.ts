import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  deleteEntry,
  getAnimateurStats,
  getRange,
  getWeek,
  moveEntry,
  upsertEntry,
  upsertProfile,
} from "@/services/planning.service";
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
}): SessionUser {
  return { ...user };
}

afterAll(async () => {
  await pool.end();
});

describe("planning des animateurs", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("upsert d'un créneau : remplace le même slot, refuse le conflit JOURNEE", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const store = await createTestStore();

    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-17",
      period: "MATIN",
      activity: "VISITE",
      storeId: store.id,
      label: null,
      kmEstimated: "10.5",
      notes: null,
    });
    // Même slot : remplacé, pas dupliqué.
    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-17",
      period: "MATIN",
      activity: "AUDIT",
      storeId: store.id,
      label: null,
      kmEstimated: "12.0",
      notes: null,
    });

    const week = await getWeek(animateur, { weekStart: "2026-08-19" });
    expect(week.monday).toBe("2026-08-17");
    expect(week.entries).toHaveLength(1);
    expect(week.entries[0].activity).toBe("AUDIT");

    // JOURNEE en conflit avec le MATIN existant.
    await expect(
      upsertEntry(animateur, {
        animateurId: animateur.id,
        date: "2026-08-17",
        period: "JOURNEE",
        activity: "FORMATION",
        storeId: null,
        label: "Formation siège",
        kmEstimated: null,
        notes: null,
      })
    ).rejects.toThrow(/Journée/);
  });

  it("un animateur ne touche pas au planning d'un autre ; la direction si, avec notification", async () => {
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const collegue = asSession(await createTestUser({ role: "ANIMATION" }));
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));

    await expect(
      upsertEntry(collegue, {
        animateurId: animateur.id,
        date: "2026-08-18",
        period: "MATIN",
        activity: "VISITE",
        storeId: null,
        label: "intrusion",
        kmEstimated: null,
        notes: null,
      })
    ).rejects.toThrow(ForbiddenError);

    await upsertEntry(direction, {
      animateurId: animateur.id,
      date: "2026-08-18",
      period: "MATIN",
      activity: "REUNION",
      storeId: null,
      label: "Réunion imposée",
      kmEstimated: null,
      notes: null,
    });
    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, animateur.id),
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("PLANNING");

    // Suppression par la direction : nouvelle notification.
    const week = await getWeek(direction, {
      weekStart: "2026-08-18",
      animateurId: animateur.id,
    });
    await deleteEntry(direction, week.entries[0].id);
    expect(
      await db.query.notifications.findMany({
        where: eq(notifications.userId, animateur.id),
      })
    ).toHaveLength(2);
  });

  it("déplacement d'un créneau : conflit refusé, périmètre respecté, tiers notifié", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    const collegue = asSession(await createTestUser({ role: "ANIMATION" }));

    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-17",
      period: "MATIN",
      activity: "VISITE",
      storeId: null,
      label: null,
      kmEstimated: null,
      notes: null,
    });
    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-19",
      period: "JOURNEE",
      activity: "AUDIT",
      storeId: null,
      label: "Audit BM-042",
      kmEstimated: null,
      notes: null,
    });
    const week = await getWeek(animateur, { weekStart: "2026-08-17" });
    const visite = week.entries.find((e) => e.activity === "VISITE")!;

    // Mercredi porte une « Journée » : le déplacement y est refusé.
    await expect(moveEntry(animateur, visite.id, "2026-08-19")).rejects.toThrow(
      /Impossible de déplacer/
    );

    // Un collègue ne déplace pas les créneaux d'autrui.
    await expect(moveEntry(collegue, visite.id, "2026-08-18")).rejects.toThrow(
      ForbiddenError
    );

    // La direction déplace, l'animateur est notifié.
    const moved = await moveEntry(direction, visite.id, "2026-08-18");
    expect(moved.date).toBe("2026-08-18");
    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, animateur.id),
    });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].title).toContain("déplacé");

    // getRange retrouve le créneau sur sa nouvelle date, avec ses relations.
    const range = await getRange(animateur, {
      from: "2026-08-18",
      to: "2026-08-18",
    });
    expect(range).toHaveLength(1);
    expect(range[0].activity).toBe("VISITE");
    expect(range[0].animateur.id).toBe(animateur.id);

    // Déplacement vers sa propre date : no-op sans erreur ni notification.
    await moveEntry(direction, moved.id, "2026-08-18");
    expect(
      await db.query.notifications.findMany({
        where: eq(notifications.userId, animateur.id),
      })
    ).toHaveLength(1);
  });

  it("les statistiques croisent km planifiés, coût du profil et visites finalisées", async () => {
    const direction = asSession(await createTestUser({ role: "DIRECTION" }));
    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));

    await upsertProfile(direction, animateur.id, {
      zone: "Sud",
      theoreticalRoute: null,
      costPerKm: "0.500",
      notes: null,
    });
    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-03",
      period: "MATIN",
      activity: "VISITE",
      storeId: null,
      label: null,
      kmEstimated: "100.5",
      notes: null,
    });
    await upsertEntry(animateur, {
      animateurId: animateur.id,
      date: "2026-08-04",
      period: "JOURNEE",
      activity: "TRAJET",
      storeId: null,
      label: null,
      kmEstimated: "99.5",
      notes: null,
    });

    const stats = await getAnimateurStats(direction, animateur.id, {
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(stats.kmPlanned).toBe("200.0");
    expect(stats.estimatedCost).toBe("100.00"); // 200 km × 0,50 €
    expect(stats.plannedCount).toBe(2);
  });
});
