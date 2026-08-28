// Factories de test : créent des enregistrements valides avec des valeurs par
// défaut, surchargées librement par chaque test.
import { db } from "@/lib/db/client";
import {
  acctInvoices,
  acctStructures,
  actionPlans,
  auditCriteria,
  contracts,
  depots,
  dpsPurchases,
  employees,
  franchisees,
  productFamilies,
  products,
  productSales,
  fileAttachments,
  storeVisits,
  stores,
  trainings,
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

type AcctStructureOverrides = Partial<typeof acctStructures.$inferInsert>;

// Structure comptable (étape 52) — le CA des tests passe par le journal.
export async function createTestAcctStructure(
  overrides: AcctStructureOverrides = {}
) {
  const n = nextId();
  const [structure] = await db
    .insert(acctStructures)
    .values({
      code: `411T${String(n).padStart(4, "0")}`,
      name: `Structure Test ${n}`,
      type: "BOUTIQUE",
      ...overrides,
    })
    .returning();
  return structure;
}

type AcctInvoiceOverrides = Partial<typeof acctInvoices.$inferInsert>;

// Pièce du journal comptable — classe 7 (CA) par défaut.
export async function createTestAcctInvoice(
  structureId: string,
  overrides: AcctInvoiceOverrides = {}
) {
  const n = nextId();
  const [invoice] = await db
    .insert(acctInvoices)
    .values({
      pieceNumber: `FA-T${String(n).padStart(4, "0")}`,
      pieceType: "FACTURE",
      accountClass: "PRODUIT",
      pieceDate: "2026-08-01",
      structureId,
      amountHT: "100.00",
      amountVAT: "20.00",
      amountTTC: "120.00",
      ...overrides,
    })
    .returning();
  return invoice;
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

type TrainingOverrides = Partial<typeof trainings.$inferInsert>;

export async function createTestTraining(
  storeId: string,
  overrides: TrainingOverrides = {}
) {
  const trainerId = overrides.trainerId ?? (await createTestUser()).id;
  const [training] = await db
    .insert(trainings)
    .values({
      storeId,
      type: "CONTINUE",
      trainingDate: "2026-08-01",
      ...overrides,
      trainerId,
    })
    .returning();
  return training;
}

type FileOverrides = Partial<typeof fileAttachments.$inferInsert>;

// Fichier « fantôme » (métadonnées seules, sans écriture disque) pour tester
// les rattachements ; ne pas l'utiliser pour tester le téléchargement réel.
export async function createTestFile(overrides: FileOverrides = {}) {
  const n = nextId();
  const uploadedById = overrides.uploadedById ?? (await createTestUser()).id;
  const [file] = await db
    .insert(fileAttachments)
    .values({
      originalName: `document-${n}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1234,
      sha256: `sha-test-${n}`,
      storagePath: `test/${n}.pdf`,
      ...overrides,
      uploadedById,
    })
    .returning();
  return file;
}

type EmployeeOverrides = Partial<typeof employees.$inferInsert>;

export async function createTestEmployee(overrides: EmployeeOverrides = {}) {
  const n = nextId();
  const [employee] = await db
    .insert(employees)
    .values({
      firstName: `Salarié${n}`,
      lastName: `Test${n}`,
      position: "Équipier",
      contractType: "CDI",
      hireDate: "2025-01-06",
      ...overrides,
    })
    .returning();
  return employee;
}
