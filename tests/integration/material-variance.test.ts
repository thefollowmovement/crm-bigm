import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { notifications, stores } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import {
  createIngredient,
  getOrCreateRecipe,
  setIngredientPrice,
  setRecipeItem,
} from "@/services/foodcost.service";
import { getMaterialVariance } from "@/services/material-variance.service";
import { getDirectionCockpit } from "@/services/dashboard.service";
import { runPurchaseAnomalyJob } from "@/lib/jobs/purchase-anomaly";
import { resetDb } from "./setup/reset-db";
import {
  createRevenueEntry,
  createTestDepot,
  createTestProduct,
  createTestProductSale,
  createTestPurchase,
  createTestStore,
  createTestUser,
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

describe("écart matière & cockpit direction", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("écart matière : théorique au centime près vs achats réels, produits non valorisés listés", async () => {
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );

    const depot = await createTestDepot();
    const store = await createTestStore();
    await db.update(stores).set({ depotId: depot.id }).where(eq(stores.id, store.id));

    // Steak haché 4,50 €/kg au dépôt ; recette : 150 g par burger.
    const steak = await createIngredient(direction, {
      name: "Steak haché test",
      unit: "KG",
    });
    await setIngredientPrice(direction, {
      ingredientId: steak.id,
      depotId: depot.id,
      pricePerUnit: "4.5000",
      effectiveDate: "2026-01-01",
    });
    const burger = await createTestProduct();
    const recipe = await getOrCreateRecipe(direction, burger.id);
    await setRecipeItem(direction, recipe.id, {
      ingredientId: steak.id,
      quantity: "0.1500",
    });

    // 100 burgers vendus en juillet + un produit SANS recette.
    await createTestProductSale(store.id, burger.id, {
      date: "2026-07-10",
      quantity: 100,
    });
    const mystery = await createTestProduct();
    await createTestProductSale(store.id, mystery.id, {
      date: "2026-07-12",
      quantity: 5,
    });
    await createTestPurchase(store.id, { date: "2026-07-15", amount: "80.00" });

    const rows = await getMaterialVariance(direction, 2026, 7);
    const row = rows.find((r) => r.store.id === store.id);
    // Théorique : 0,150 kg × 4,50 € × 100 = 67,50 € ; réel 80 € → +12,50 (18,5 %).
    expect(row?.theoretical).toBe("67.50");
    expect(row?.actual).toBe("80.00");
    expect(row?.variance).toBe("12.50");
    expect(row?.variancePct).toBe(18.5);
    expect(row?.missingProducts).toHaveLength(1);

    // Réservé au siège food cost — pas de franchisé.
    const franchise = asSession(await createTestUser({ role: "FRANCHISE" }));
    await expect(getMaterialVariance(franchise, 2026, 7)).rejects.toThrow(
      ForbiddenError
    );
  });

  it("cockpit direction : agrégats présents, interdit hors direction", async () => {
    const direction = asSession(
      await createTestUser({ role: "DIRECTION", pole: "DIRECTION" })
    );
    const store = await createTestStore();
    await createRevenueEntry(store.id, { grossAmount: "1234.56" });

    const cockpit = await getDirectionCockpit(direction);
    expect(cockpit.revenue.current).toBeDefined();
    expect(cockpit.topStores.length).toBeGreaterThanOrEqual(0);
    expect(typeof cockpit.openTickets).toBe("number");
    expect(typeof cockpit.auditsOverdue).toBe("number");

    const compta = asSession(
      await createTestUser({ role: "COMPTABILITE", pole: "COMPTABILITE" })
    );
    await expect(getDirectionCockpit(compta)).rejects.toThrow(ForbiddenError);
  });

  it("job purchase-anomaly : alerte mensuelle idempotente sur ratio hors bornes", async () => {
    const direction = await createTestUser({
      role: "DIRECTION",
      pole: "DIRECTION",
    });
    const store = await createTestStore();

    // Mois précédent : CA 1000 €, achats 600 € → ratio 60 % (> 40 par défaut).
    const now = new Date();
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));
    const prevDate = prev.toISOString().slice(0, 10);
    await createRevenueEntry(store.id, { date: prevDate, grossAmount: "1000.00" });
    await createTestPurchase(store.id, { date: prevDate, amount: "600.00" });

    const first = await runPurchaseAnomalyJob();
    expect(first.anomalies).toBe(1);
    expect(first.notified).toBeGreaterThan(0);
    // Rejoué : dedupeKey mensuel → aucune nouvelle notification.
    const second = await runPurchaseAnomalyJob();
    expect(second.anomalies).toBe(1);
    expect(second.notified).toBe(0);

    const notifs = await db.query.notifications.findMany({
      where: eq(notifications.userId, direction.id),
    });
    expect(notifs.filter((n) => n.type === "ALERTE")).toHaveLength(1);
  });
});
