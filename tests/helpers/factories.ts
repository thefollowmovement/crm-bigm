// Factories de test : créent des enregistrements valides avec des valeurs par
// défaut, surchargées librement par chaque test.
import { db } from "@/lib/db/client";
import {
  actionPlans,
  auditCriteria,
  contracts,
  depots,
  dpsPurchases,
  franchisees,
  invoices,
  productFamilies,
  products,
  productSales,
  revenueEntries,
  storeVisits,
  stores,
  users,
} from "@/db/schema";

let counter = 0;
function nextId() {
  counter += 1;
  return counter;
}

// Hash argon2id précalculé de "Test1234!" — évite ~100 ms de hachage par test.
export const TEST_PASSWORD = "Test1234!";
export const TEST_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$0NGrbHHPJaLG7KehYmtp4A$WjzbJ5Zx2LRGCwwLWdvXtYNyaExDEHQ7ml3yebwmMrQ";

type UserOverrides = Partial<typeof users.$inferInsert>;

export async function createTestUser(overrides: UserOverrides = {}) {
  const n = nextId();
  const [user] = await db
    .insert(users)
    .values({
      email: `user${n}@test.fr`,
      passwordHash: TEST_PASSWORD_HASH,
      firstName: `Prénom${n}`,
      lastName: `Nom${n}`,
      role: "ADMIN",
      ...overrides,
    })
    .returning();
  return user;
}

type FranchiseeOverrides = Partial<typeof franchisees.$inferInsert>;

export async function createTestFranchisee(overrides: FranchiseeOverrides = {}) {
  const n = nextId();
  const [franchisee] = await db
    .insert(franchisees)
    .values({
      companyName: `SARL Test ${n}`,
      contactFirstName: "Jean",
      contactLastName: `Testeur${n}`,
      ...overrides,
    })
    .returning();
  return franchisee;
}

type StoreOverrides = Partial<typeof stores.$inferInsert>;

export async function createTestStore(overrides: StoreOverrides = {}) {
  const n = nextId();
  const [store] = await db
    .insert(stores)
    .values({
      code: `BM-T${String(n).padStart(3, "0")}`,
      name: `Boutique Test ${n}`,
      type: "FRANCHISE",
      status: "OUVERTE",
      ...overrides,
    })
    .returning();
  return store;
}

type ContractOverrides = Partial<typeof contracts.$inferInsert>;

export async function createTestContract(
  storeId: string,
  overrides: ContractOverrides = {}
) {
  const [contract] = await db
    .insert(contracts)
    .values({
      storeId,
      type: "CONTRAT_FRANCHISE",
      status: "ACTIF",
      startDate: "2022-01-01",
      endDate: "2029-01-01",
      ...overrides,
    })
    .returning();
  return contract;
}

type RevenueEntryOverrides = Partial<typeof revenueEntries.$inferInsert>;

export async function createRevenueEntry(
  storeId: string,
  overrides: RevenueEntryOverrides = {}
) {
  const enteredById = overrides.enteredById ?? (await createTestUser()).id;
  const [entry] = await db
    .insert(revenueEntries)
    .values({
      storeId,
      date: "2026-08-01",
      channel: "SUR_PLACE",
      grossAmount: "100.00",
      source: "SAISIE",
      ...overrides,
      enteredById,
    })
    .returning();
  return entry;
}

type FamilyOverrides = Partial<typeof productFamilies.$inferInsert>;

export async function createTestFamily(overrides: FamilyOverrides = {}) {
  const n = nextId();
  const [family] = await db
    .insert(productFamilies)
    .values({ name: `Famille ${n}`, ...overrides })
    .returning();
  return family;
}

type ProductOverrides = Partial<typeof products.$inferInsert>;

export async function createTestProduct(overrides: ProductOverrides = {}) {
  const n = nextId();
  const familyId = overrides.familyId ?? (await createTestFamily()).id;
  const [product] = await db
    .insert(products)
    .values({
      code: `PROD-T${String(n).padStart(3, "0")}`,
      name: `Produit Test ${n}`,
      ...overrides,
      familyId,
    })
    .returning();
  return product;
}

type ProductSaleOverrides = Partial<typeof productSales.$inferInsert>;

export async function createTestProductSale(
  storeId: string,
  productId: string,
  overrides: ProductSaleOverrides = {}
) {
  const enteredById = overrides.enteredById ?? (await createTestUser()).id;
  const [sale] = await db
    .insert(productSales)
    .values({
      storeId,
      productId,
      date: "2026-08-01",
      quantity: 10,
      source: "SAISIE",
      ...overrides,
      enteredById,
    })
    .returning();
  return sale;
}

type CriterionOverrides = Partial<typeof auditCriteria.$inferInsert>;

export async function createTestCriterion(overrides: CriterionOverrides = {}) {
  const n = nextId();
  const [criterion] = await db
    .insert(auditCriteria)
    .values({ label: `Critère ${n}`, maxScore: 10, ...overrides })
    .returning();
  return criterion;
}

type VisitOverrides = Partial<typeof storeVisits.$inferInsert>;

export async function createTestVisit(
  storeId: string,
  overrides: VisitOverrides = {}
) {
  const visitedById = overrides.visitedById ?? (await createTestUser()).id;
  const [visit] = await db
    .insert(storeVisits)
    .values({
      storeId,
      type: "AUDIT",
      visitDate: "2026-08-01",
      ...overrides,
      visitedById,
    })
    .returning();
  return visit;
}

type ActionPlanOverrides = Partial<typeof actionPlans.$inferInsert>;

export async function createTestActionPlan(
  storeId: string,
  overrides: ActionPlanOverrides = {}
) {
  const createdById = overrides.createdById ?? (await createTestUser()).id;
  const [plan] = await db
    .insert(actionPlans)
    .values({
      storeId,
      title: "Plan de test",
      ...overrides,
      createdById,
    })
    .returning();
  return plan;
}

type DepotOverrides = Partial<typeof depots.$inferInsert>;

export async function createTestDepot(overrides: DepotOverrides = {}) {
  const n = nextId();
  const [depot] = await db
    .insert(depots)
    .values({ code: `DPS-T${String(n).padStart(3, "0")}`, name: `Dépôt Test ${n}`, ...overrides })
    .returning();
  return depot;
}

type PurchaseOverrides = Partial<typeof dpsPurchases.$inferInsert>;

export async function createTestPurchase(
  storeId: string,
  overrides: PurchaseOverrides = {}
) {
  const n = nextId();
  const depotId = overrides.depotId ?? (await createTestDepot()).id;
  const enteredById = overrides.enteredById ?? (await createTestUser()).id;
  const [purchase] = await db
    .insert(dpsPurchases)
    .values({
      storeId,
      date: "2026-08-01",
      reference: `BL-T${String(n).padStart(4, "0")}`,
      amount: "100.00",
      source: "SAISIE",
      ...overrides,
      depotId,
      enteredById,
    })
    .returning();
  return purchase;
}

type InvoiceOverrides = Partial<typeof invoices.$inferInsert>;

export async function createTestInvoice(
  storeId: string,
  overrides: InvoiceOverrides = {}
) {
  const n = nextId();
  const [invoice] = await db
    .insert(invoices)
    .values({
      number: `F-TEST-${String(n).padStart(4, "0")}`,
      storeId,
      type: "REDEVANCE",
      amountHT: "1000.00",
      vatRate: "20.00",
      amountTTC: "1200.00",
      issuedAt: "2026-01-05",
      dueDate: "2026-02-05",
      ...overrides,
    })
    .returning();
  return invoice;
}
