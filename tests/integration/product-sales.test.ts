import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { auditLogs, productSales } from "@/db/schema";
import type { SessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/authz/guards";
import { createFamily, createProduct } from "@/services/products.service";
import {
  getFamilyBreakdown,
  getTopProducts,
  importRows,
} from "@/services/product-sales.service";
import { getStoreMonth, upsertEntry } from "@/services/revenue.service";
import { resetDb } from "./setup/reset-db";
import {
  createTestFamily,
  createTestFranchisee,
  createTestProduct,
  createTestProductSale,
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

describe("référentiel produits", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("normalise le code, refuse les doublons et exige product:manage", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const family = await createFamily(compta, { name: "Burgers" });
    const product = await createProduct(compta, {
      code: "burger-xl",
      name: "Burger XL",
      familyId: family.id,
    });
    expect(product.code).toBe("BURGER-XL");

    await expect(
      createProduct(compta, {
        code: "BURGER-XL",
        name: "Doublon",
        familyId: family.id,
      })
    ).rejects.toThrow(/existe déjà/);

    const animateur = asSession(await createTestUser({ role: "ANIMATION" }));
    await expect(createFamily(animateur, { name: "Interdit" })).rejects.toThrow(
      ForbiddenError
    );
  });
});

describe("import des ventes produits", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("importe, signale les codes inconnus, reste idempotent, audite en agrégé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore({ code: "BM-PS" });
    const family = await createTestFamily({ name: "Burgers" });
    const product = await createTestProduct({
      code: "BURGER-XL",
      familyId: family.id,
    });

    const rows = [
      {
        storeCode: "BM-PS",
        date: "2026-08-01",
        productCode: "BURGER-XL",
        quantity: 10,
        amount: "120.00",
      },
      {
        storeCode: "BM-PS",
        date: "2026-08-02",
        productCode: "BURGER-XL",
        quantity: 7,
        amount: null,
      },
      {
        storeCode: "BM-PS",
        date: "2026-08-01",
        productCode: "INCONNU",
        quantity: 1,
        amount: null,
      },
    ];

    const first = await importRows(compta, rows);
    expect(first.imported).toBe(2);
    expect(first.updated).toBe(0);
    expect(first.errors).toHaveLength(1);
    expect(first.errors[0].message).toContain("INCONNU");

    const second = await importRows(compta, rows);
    expect(second.imported).toBe(0);
    expect(second.updated).toBe(2);
    expect(
      await db.query.productSales.findMany({
        where: eq(productSales.storeId, store.id),
      })
    ).toHaveLength(2);
    void product;

    const logs = await db.query.auditLogs.findMany({
      where: eq(auditLogs.tableName, "product_sales"),
    });
    expect(logs.filter((l) => l.action === "IMPORT")).toHaveLength(2);
    expect(logs.filter((l) => l.action !== "IMPORT")).toHaveLength(0);
  });

  it("agrège top produits et familles, en respectant le scope franchisé", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const franchisee = await createTestFranchisee();
    const mine = await createTestStore({ franchiseeId: franchisee.id });
    const other = await createTestStore();
    const burgers = await createTestFamily({ name: "Burgers" });
    const desserts = await createTestFamily({ name: "Desserts" });
    const burger = await createTestProduct({ code: "P-B", familyId: burgers.id });
    const dessert = await createTestProduct({ code: "P-D", familyId: desserts.id });

    await createTestProductSale(mine.id, burger.id, {
      date: "2026-08-01",
      quantity: 30,
      amount: "300.00",
      enteredById: compta.id,
    });
    await createTestProductSale(other.id, burger.id, {
      date: "2026-08-01",
      quantity: 50,
      amount: "500.00",
      enteredById: compta.id,
    });
    await createTestProductSale(other.id, dessert.id, {
      date: "2026-08-01",
      quantity: 5,
      amount: "25.00",
      enteredById: compta.id,
    });

    const period = { from: "2026-08-01", to: "2026-08-31" };
    const top = await getTopProducts(compta, period);
    expect(top[0]).toMatchObject({ code: "P-B", quantity: 80, amount: "800.00" });

    const families = await getFamilyBreakdown(compta, period);
    expect(families.map((f) => [f.familyName, f.quantity])).toEqual([
      ["Burgers", 80],
      ["Desserts", 5],
    ]);

    const franchise = asSession(
      await createTestUser({ role: "FRANCHISE", franchiseeId: franchisee.id })
    );
    const scopedTop = await getTopProducts(franchise, period);
    expect(scopedTop).toHaveLength(1);
    expect(scopedTop[0].quantity).toBe(30);
  });

  it("calcule le panier moyen du mois sur les seules lignes renseignées", async () => {
    const compta = asSession(await createTestUser({ role: "COMPTABILITE" }));
    const store = await createTestStore();
    await upsertEntry(compta, {
      storeId: store.id,
      date: "2026-08-01",
      channel: "SUR_PLACE",
      channelLabel: null,
      grossAmount: "1000.00",
      netAmount: null,
      orderCount: 100,
    });
    await upsertEntry(compta, {
      storeId: store.id,
      date: "2026-08-02",
      channel: "SUR_PLACE",
      channelLabel: null,
      grossAmount: "500.00",
      netAmount: null,
      orderCount: 25,
    });
    // ligne sans nb de commandes : exclue du panier moyen
    await upsertEntry(compta, {
      storeId: store.id,
      date: "2026-08-03",
      channel: "EMPORTE",
      channelLabel: null,
      grossAmount: "999.99",
      netAmount: null,
      orderCount: null,
    });

    const month = await getStoreMonth(compta, store.id, "2026-08");
    expect(month.orderTotal).toBe(125);
    expect(month.averageBasket).toBe("12.00"); // 1500 / 125
    expect(month.grandTotal).toBe("2499.99");
  });
});
