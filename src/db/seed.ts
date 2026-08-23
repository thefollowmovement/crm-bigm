// Seed de la base :
// - toujours : compte administrateur initial (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
// - si SEED_DEMO=true : jeu de démonstration (utilisateurs par rôle, boutiques,
//   franchisés, contrats) — utilisé par le dev local et les tests e2e.
// Idempotent : réexécutable sans doublons.
import "@/lib/load-env";

import { and, eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { addDaysIso, startOfWeekIso, todayParis } from "@/lib/dates";
import {
  actionPlans,
  agents,
  animatorPlanEntries,
  animatorProfiles,
  auditCriteria,
  auditItems,
  contracts,
  depots,
  dpsPurchases,
  ingredientPrices,
  ingredients,
  recipeItems,
  recipes,
  employees,
  exchangeMessages,
  exchanges,
  franchisees,
  openingChecklistItems,
  openingProjects,
  openingSteps,
  premises,
  prospectEvents,
  prospects,
  resaleListings,
  commTasks,
  companyBudgets,
  companyFlows,
  invoices,
  partners,
  payments,
  productFamilies,
  products,
  productSales,
  reminders,
  revenueEntries,
  softwareRegistry,
  storeExpenses,
  storeVisits,
  stores,
  trainingParticipants,
  trainings,
  users,
  type roleEnum,
} from "@/db/schema";

type Role = (typeof roleEnum.enumValues)[number];

async function upsertUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Role;
  pole?: "DIRECTION" | "COMPTABILITE" | "RH" | "ANIMATION" | "COMMUNICATION" | "DEVELOPPEMENT";
  franchiseeId?: string;
}) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, input.email),
  });
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      firstName: input.firstName,
      lastName: input.lastName,
      role: input.role,
      pole: input.pole ?? null,
      franchiseeId: input.franchiseeId ?? null,
    })
    .returning();
  console.log(`Utilisateur créé : ${input.email} (${input.role})`);
  return created;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@bigm.fr";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("SEED_ADMIN_PASSWORD manquant : impossible de créer l'admin.");
    process.exit(1);
  }

  await upsertUser({
    email: adminEmail,
    password: adminPassword,
    firstName: "Admin",
    lastName: "Big M",
    role: "ADMIN",
    pole: "DIRECTION",
  });

  if (process.env.SEED_DEMO !== "true") {
    console.log("Seed terminé (admin uniquement — SEED_DEMO non activé).");
    return;
  }

  // ── Jeu de démonstration ────────────────────────────────────────
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "Test1234!";

  const direction = await upsertUser({
    email: "direction@bigm.fr",
    password: demoPassword,
    firstName: "Diane",
    lastName: "Direction",
    role: "DIRECTION",
    pole: "DIRECTION",
  });
  await upsertUser({
    email: "compta@bigm.fr",
    password: demoPassword,
    firstName: "Camille",
    lastName: "Comptable",
    role: "COMPTABILITE",
    pole: "COMPTABILITE",
  });
  const animateur = await upsertUser({
    email: "animateur@bigm.fr",
    password: demoPassword,
    firstName: "Antoine",
    lastName: "Animateur",
    role: "ANIMATION",
    pole: "ANIMATION",
  });
  await upsertUser({
    email: "communication@bigm.fr",
    password: demoPassword,
    firstName: "Chloé",
    lastName: "Communication",
    role: "COMMUNICATION",
    pole: "COMMUNICATION",
  });
  await upsertUser({
    email: "rh@bigm.fr",
    password: demoPassword,
    firstName: "Rachid",
    lastName: "Ressources",
    role: "RH",
    pole: "RH",
  });
  await upsertUser({
    email: "developpement@bigm.fr",
    password: demoPassword,
    firstName: "David",
    lastName: "Développement",
    role: "DEVELOPPEMENT",
    pole: "DEVELOPPEMENT",
  });

  // Compte « bac à sable » du parcours Mon compte (e2e) : son e-mail et son
  // mot de passe peuvent être modifiés par les tests sans impacter les autres.
  await upsertUser({
    email: "profil@bigm.fr",
    password: demoPassword,
    firstName: "Paule",
    lastName: "Profil",
    role: "ANIMATION",
    pole: "ANIMATION",
  });

  // Compte désactivé pour les tests e2e
  const inactive = await upsertUser({
    email: "inactif@bigm.fr",
    password: demoPassword,
    firstName: "Inès",
    lastName: "Inactive",
    role: "COMMUNICATION",
    pole: "COMMUNICATION",
  });
  await db.update(users).set({ isActive: false }).where(eq(users.id, inactive.id));

  const existingFranchisee = await db.query.franchisees.findFirst({
    where: eq(franchisees.siren, "912345678"),
  });
  const franchisee =
    existingFranchisee ??
    (
      await db
        .insert(franchisees)
        .values({
          companyName: "SARL Resto Lyon",
          legalForm: "SARL",
          siren: "912345678",
          contactFirstName: "Farid",
          contactLastName: "Franchisé",
          email: "franchise.lyon@exemple.fr",
          phone: "04 72 00 00 00",
          city: "Lyon",
          postalCode: "69003",
          notes: "Franchisé historique, très bon relationnel.",
        })
        .returning()
    )[0];

  await upsertUser({
    email: "franchise@bigm.fr",
    password: demoPassword,
    firstName: "Farid",
    lastName: "Franchisé",
    role: "FRANCHISE",
    franchiseeId: franchisee.id,
  });

  const demoStores = [
    {
      code: "BM-001",
      name: "Big M Lyon Part-Dieu",
      type: "FRANCHISE" as const,
      status: "OUVERTE" as const,
      franchiseeId: franchisee.id,
      animateurId: animateur.id,
      city: "Lyon",
      postalCode: "69003",
      region: "Auvergne-Rhône-Alpes",
      openingDate: "2022-03-15",
    },
    {
      code: "BM-002",
      name: "Big M Villeurbanne",
      type: "FRANCHISE" as const,
      status: "OUVERTE" as const,
      franchiseeId: franchisee.id,
      animateurId: animateur.id,
      city: "Villeurbanne",
      postalCode: "69100",
      region: "Auvergne-Rhône-Alpes",
      openingDate: "2023-06-01",
    },
    {
      code: "BM-003",
      name: "Big M Paris Bastille",
      type: "SUCCURSALE" as const,
      status: "OUVERTE" as const,
      franchiseeId: null,
      animateurId: animateur.id,
      city: "Paris",
      postalCode: "75011",
      region: "Île-de-France",
      openingDate: "2021-09-01",
    },
    {
      code: "BM-004",
      name: "Big M Grenoble",
      type: "FRANCHISE" as const,
      status: "EN_PROJET" as const,
      franchiseeId: franchisee.id,
      animateurId: animateur.id,
      city: "Grenoble",
      postalCode: "38000",
      region: "Auvergne-Rhône-Alpes",
      openingDate: "2027-03-01",
    },
  ];

  for (const s of demoStores) {
    const existing = await db.query.stores.findFirst({ where: eq(stores.code, s.code) });
    if (existing) continue;
    const [store] = await db
      .insert(stores)
      .values({ ...s, internalNotes: "Notes internes siège (démo)." })
      .returning();
    console.log(`Boutique créée : ${store.code} ${store.name}`);
    // Pas de contrat pour une boutique encore en projet (parcours DIP → contrat).
    if (s.type === "FRANCHISE" && s.status !== "EN_PROJET") {
      await db.insert(contracts).values({
        storeId: store.id,
        franchiseeId: s.franchiseeId,
        type: "CONTRAT_FRANCHISE",
        status: "ACTIF",
        reference: `CF-${store.code}`,
        signedAt: s.openingDate,
        startDate: s.openingDate,
        // contrat de 7 ans
        endDate: `${Number(s.openingDate.slice(0, 4)) + 7}${s.openingDate.slice(4)}`,
      });
    }
  }

  // Contrat proche de l'échéance (3 mois) : déclenche l'alerte J-180 en démo/e2e.
  const bm002 = await db.query.stores.findFirst({ where: eq(stores.code, "BM-002") });
  if (bm002) {
    const already = await db.query.contracts.findFirst({
      where: eq(contracts.reference, "BAIL-BM-002"),
    });
    if (!already) {
      const soon = new Date();
      soon.setMonth(soon.getMonth() + 3);
      await db.insert(contracts).values({
        storeId: bm002.id,
        franchiseeId: bm002.franchiseeId,
        type: "BAIL",
        status: "ACTIF",
        reference: "BAIL-BM-002",
        startDate: "2020-01-01",
        endDate: soon.toISOString().slice(0, 10),
      });
      console.log("Contrat BAIL-BM-002 créé (échéance dans 3 mois).");
    }
  }

  // ── Échanges franchisés de démonstration ────────────────────────
  const admin = await db.query.users.findFirst({
    where: eq(users.email, adminEmail),
  });
  const franchiseUser = await db.query.users.findFirst({
    where: eq(users.email, "franchise@bigm.fr"),
  });
  const bm001 = await db.query.stores.findFirst({ where: eq(stores.code, "BM-001") });
  const bm003 = await db.query.stores.findFirst({ where: eq(stores.code, "BM-003") });

  if (admin && franchiseUser && bm001) {
    const existingExchange = await db.query.exchanges.findFirst({
      where: eq(exchanges.subject, "Demande d'aménagement de la terrasse"),
    });
    if (!existingExchange) {
      const [exchange] = await db
        .insert(exchanges)
        .values({
          storeId: bm001.id,
          type: "DEMANDE",
          status: "EN_COURS",
          subject: "Demande d'aménagement de la terrasse",
          createdById: franchiseUser.id,
        })
        .returning();
      await db.insert(exchangeMessages).values([
        {
          exchangeId: exchange.id,
          authorId: franchiseUser.id,
          body: "Bonjour, nous souhaitons installer 4 tables en terrasse cet été. Faut-il une validation du réseau ?",
        },
        {
          exchangeId: exchange.id,
          authorId: admin.id,
          body: "Note interne : vérifier la conformité avec la charte terrasses avant de répondre.",
          isInternal: true,
        },
        {
          exchangeId: exchange.id,
          authorId: admin.id,
          body: "Accord de principe : mobilier conforme à la charte réseau, plan d'implantation à nous transmettre.",
          isDecision: true,
        },
      ]);
      console.log("Échange de démonstration créé (BM-001).");
    }
  }

  // ── Factures de démonstration ───────────────────────────────────
  const comptaUser = await db.query.users.findFirst({
    where: eq(users.email, "compta@bigm.fr"),
  });
  if (bm001 && comptaUser) {
    const existingInvoice = await db.query.invoices.findFirst({
      where: eq(invoices.label, "Redevance de démonstration"),
    });
    if (!existingInvoice) {
      const year = new Date().getFullYear();
      const overdueDate = new Date();
      overdueDate.setDate(overdueDate.getDate() - 30);
      const overdueIso = overdueDate.toISOString().slice(0, 10);

      const [paidInvoice] = await db
        .insert(invoices)
        .values({
          number: `F${year}-9001`,
          storeId: bm001.id,
          type: "REDEVANCE",
          label: "Redevance de démonstration",
          amountHT: "2500.00",
          vatRate: "20.00",
          amountTTC: "3000.00",
          issuedAt: `${year}-01-05`,
          dueDate: `${year}-02-05`,
          status: "PAYEE",
        })
        .returning();
      await db.insert(payments).values({
        invoiceId: paidInvoice.id,
        amount: "3000.00",
        paidAt: `${year}-01-28`,
        method: "PRELEVEMENT",
        reference: "PRLV-0128",
      });

      const [overdueInvoice] = await db
        .insert(invoices)
        .values({
          number: `F${year}-9002`,
          storeId: bm001.id,
          type: "REDEVANCE_COMMUNICATION",
          label: "Redevance communication (démo impayée)",
          amountHT: "800.00",
          vatRate: "20.00",
          amountTTC: "960.00",
          issuedAt: `${year}-01-05`,
          dueDate: overdueIso,
          status: "EMISE",
        })
        .returning();
      await db.insert(reminders).values({
        invoiceId: overdueInvoice.id,
        level: 1,
        channel: "EMAIL",
        sentAt: new Date().toISOString().slice(0, 10),
        sentById: comptaUser.id,
        notes: "Première relance amiable.",
      });
      console.log("Factures de démonstration créées (BM-001).");
    }
  }

  // ── Chiffre d'affaires de démonstration (succursale BM-003) ─────
  if (bm003 && comptaUser) {
    const existingRevenue = await db.query.revenueEntries.findFirst({
      where: eq(revenueEntries.storeId, bm003.id),
    });
    if (!existingRevenue) {
      const month = new Date().toISOString().slice(0, 7);
      await db.insert(revenueEntries).values(
        (
          [
            [`${month}-01`, "SUR_PLACE", "1850.50", null, 118],
            [`${month}-01`, "UBER_EATS", "620.00", "545.60", 31],
            [`${month}-02`, "SUR_PLACE", "2104.00", null, 131],
            [`${month}-02`, "EMPORTE", "410.30", null, null],
          ] as const
        ).map(([date, channel, gross, net, orders]) => ({
          storeId: bm003.id,
          date,
          channel,
          grossAmount: gross,
          netAmount: net,
          orderCount: orders,
          source: "SAISIE" as const,
          enteredById: comptaUser.id,
        }))
      );
      console.log("CA de démonstration créé (BM-003).");
    }
  }

  // ── Référentiel produits + ventes de démonstration (BM-003) ─────
  if (bm003 && comptaUser) {
    const demoFamilies = [
      { name: "Burgers", displayOrder: 1 },
      { name: "Boissons", displayOrder: 2 },
      { name: "Desserts", displayOrder: 3 },
    ];
    const familyIds = new Map<string, string>();
    for (const f of demoFamilies) {
      const existing = await db.query.productFamilies.findFirst({
        where: eq(productFamilies.name, f.name),
      });
      const row =
        existing ??
        (await db.insert(productFamilies).values(f).returning())[0];
      familyIds.set(f.name, row.id);
    }

    const demoProducts = [
      { code: "BURGER-CLASSIC", name: "Burger Classic", family: "Burgers" },
      { code: "BURGER-XL", name: "Burger XL", family: "Burgers" },
      { code: "BOISSON-33", name: "Boisson 33cl", family: "Boissons" },
      { code: "DESSERT-CHOCO", name: "Moelleux chocolat", family: "Desserts" },
    ];
    const productIds = new Map<string, string>();
    for (const p of demoProducts) {
      const existing = await db.query.products.findFirst({
        where: eq(products.code, p.code),
      });
      const row =
        existing ??
        (
          await db
            .insert(products)
            .values({
              code: p.code,
              name: p.name,
              familyId: familyIds.get(p.family)!,
            })
            .returning()
        )[0];
      productIds.set(p.code, row.id);
    }

    const existingSale = await db.query.productSales.findFirst({
      where: eq(productSales.storeId, bm003.id),
    });
    if (!existingSale) {
      const month = new Date().toISOString().slice(0, 7);
      await db.insert(productSales).values(
        (
          [
            [`${month}-01`, "BURGER-CLASSIC", 64, "576.00"],
            [`${month}-01`, "BURGER-XL", 38, "455.60"],
            [`${month}-01`, "BOISSON-33", 92, "230.00"],
            [`${month}-02`, "BURGER-CLASSIC", 71, "639.00"],
            [`${month}-02`, "DESSERT-CHOCO", 24, "108.00"],
          ] as const
        ).map(([date, code, quantity, amount]) => ({
          storeId: bm003.id,
          date,
          productId: productIds.get(code)!,
          quantity,
          amount,
          source: "SAISIE" as const,
          enteredById: comptaUser.id,
        }))
      );
      console.log("Ventes produits de démonstration créées (BM-003).");
    }
  }

  // ── Animation terrain : grille d'audit, visite et plan d'action ─
  if (bm001) {
    const demoCriteria = [
      { label: "Hygiène cuisine", category: "Hygiène", maxScore: 10, displayOrder: 1 },
      { label: "Propreté salle", category: "Hygiène", maxScore: 10, displayOrder: 2 },
      { label: "Qualité de service", category: "Service", maxScore: 10, displayOrder: 3 },
      { label: "Respect des recettes", category: "Produit", maxScore: 10, displayOrder: 4 },
    ];
    const criterionIds: string[] = [];
    for (const c of demoCriteria) {
      const existing = await db.query.auditCriteria.findFirst({
        where: eq(auditCriteria.label, c.label),
      });
      const row =
        existing ?? (await db.insert(auditCriteria).values(c).returning())[0];
      criterionIds.push(row.id);
    }

    const existingVisit = await db.query.storeVisits.findFirst({
      where: eq(storeVisits.storeId, bm001.id),
    });
    if (!existingVisit) {
      const [visit] = await db
        .insert(storeVisits)
        .values({
          storeId: bm001.id,
          type: "AUDIT",
          status: "FINALISEE",
          visitDate: new Date().toISOString().slice(0, 10),
          visitedById: animateur.id,
          report:
            "Audit trimestriel : très bonne tenue générale. Un point de vigilance sur l'affichage des allergènes.",
          finalizedAt: new Date(),
        })
        .returning();
      await db.insert(auditItems).values([
        { visitId: visit.id, criterionId: criterionIds[0], score: 9, isCompliant: true },
        { visitId: visit.id, criterionId: criterionIds[1], score: 8, isCompliant: true },
        {
          visitId: visit.id,
          criterionId: criterionIds[2],
          score: 6,
          isCompliant: false,
          comment: "Affichage des allergènes incomplet au comptoir.",
        },
      ]);
      console.log("Visite d'audit de démonstration créée (BM-001).");
    }

    const existingPlan = await db.query.actionPlans.findFirst({
      where: eq(actionPlans.storeId, bm001.id),
    });
    if (!existingPlan) {
      const nextMonth = new Date(Date.now() + 30 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      await db.insert(actionPlans).values({
        storeId: bm001.id,
        title: "Mettre à jour l'affichage des allergènes",
        description:
          "Suite à l'audit : compléter l'affichage réglementaire au comptoir et en salle.",
        priority: "HAUTE",
        assigneeId: animateur.id,
        createdById: animateur.id,
        dueDate: nextMonth,
        status: "EN_COURS",
      });
      console.log("Plan d'action de démonstration créé (BM-001).");
    }
  }

  // ── Fiche et planning de l'animateur de démonstration ───────────
  {
    const existingProfile = await db.query.animatorProfiles.findFirst({
      where: eq(animatorProfiles.userId, animateur.id),
    });
    if (!existingProfile) {
      await db.insert(animatorProfiles).values({
        userId: animateur.id,
        zone: "Auvergne-Rhône-Alpes",
        theoreticalRoute: "Lyon Part-Dieu → Villeurbanne → (mensuel) Paris Bastille",
        costPerKm: "0.450",
        notes: "Animateur historique du réseau.",
      });
      console.log("Fiche animateur de démonstration créée.");
    }

    const existingEntry = await db.query.animatorPlanEntries.findFirst({
      where: eq(animatorPlanEntries.animateurId, animateur.id),
    });
    if (!existingEntry && bm001 && bm003) {
      const monday = startOfWeekIso(todayParis());
      await db.insert(animatorPlanEntries).values([
        {
          animateurId: animateur.id,
          date: monday,
          period: "MATIN",
          activity: "VISITE",
          storeId: bm001.id,
          kmEstimated: "12.0",
        },
        {
          animateurId: animateur.id,
          date: monday,
          period: "APRES_MIDI",
          activity: "REUNION",
          label: "Point réseau hebdomadaire",
        },
        {
          animateurId: animateur.id,
          date: addDaysIso(monday, 2),
          period: "JOURNEE",
          activity: "AUDIT",
          storeId: bm003.id,
          kmEstimated: "480.0",
          notes: "Aller-retour Paris (train).",
        },
      ]);
      console.log("Planning de démonstration créé (semaine en cours).");
    }
  }

  // ── Dépôts DPS + achats de démonstration ────────────────────────
  {
    const demoDepots = [
      { code: "DPS-LYON", name: "DPS Lyon Rhône", city: "Lyon" },
      { code: "DPS-PARIS", name: "DPS Paris Est", city: "Paris" },
    ];
    const depotIds = new Map<string, string>();
    for (const d of demoDepots) {
      const existing = await db.query.depots.findFirst({
        where: eq(depots.code, d.code),
      });
      const row = existing ?? (await db.insert(depots).values(d).returning())[0];
      depotIds.set(d.code, row.id);
    }

    // Rattachement des boutiques à leur dépôt (si pas déjà fait).
    const assignments: [string, string][] = [
      ["BM-001", "DPS-LYON"],
      ["BM-002", "DPS-LYON"],
      ["BM-003", "DPS-PARIS"],
    ];
    for (const [storeCode, depotCode] of assignments) {
      const store = await db.query.stores.findFirst({
        where: eq(stores.code, storeCode),
      });
      if (store && !store.depotId) {
        await db
          .update(stores)
          .set({ depotId: depotIds.get(depotCode)! })
          .where(eq(stores.id, store.id));
      }
    }

    if (bm003 && comptaUser) {
      const existingPurchase = await db.query.dpsPurchases.findFirst({
        where: eq(dpsPurchases.storeId, bm003.id),
      });
      if (!existingPurchase) {
        const month = new Date().toISOString().slice(0, 7);
        await db.insert(dpsPurchases).values([
          {
            storeId: bm003.id,
            depotId: depotIds.get("DPS-PARIS")!,
            date: `${month}-02`,
            reference: "BL-DEMO-2001",
            amount: "980.40",
            source: "SAISIE",
            enteredById: comptaUser.id,
          },
          {
            storeId: bm003.id,
            depotId: depotIds.get("DPS-PARIS")!,
            date: `${month}-01`,
            reference: "BL-DEMO-2000",
            amount: "540.10",
            source: "SAISIE",
            enteredById: comptaUser.id,
          },
        ]);
        console.log("Achats DPS de démonstration créés (BM-003).");
      }
    }

    // ── Food Cost de démonstration ────────────────────────────────
    const demoIngredients = [
      { name: "Steak haché", unit: "KG" as const },
      { name: "Pain burger", unit: "PIECE" as const },
      { name: "Cheddar", unit: "KG" as const },
    ];
    const ingredientIds = new Map<string, string>();
    for (const ing of demoIngredients) {
      const existing = await db.query.ingredients.findFirst({
        where: eq(ingredients.name, ing.name),
      });
      const row = existing ?? (await db.insert(ingredients).values(ing).returning())[0];
      ingredientIds.set(ing.name, row.id);
    }

    const demoPrices: [string, string, string][] = [
      // [ingrédient, dépôt, tarif €/unité]
      ["Steak haché", "DPS-LYON", "9.8000"],
      ["Steak haché", "DPS-PARIS", "10.4000"],
      ["Pain burger", "DPS-LYON", "0.3500"],
      ["Pain burger", "DPS-PARIS", "0.3900"],
      ["Cheddar", "DPS-LYON", "7.2000"],
      ["Cheddar", "DPS-PARIS", "7.9000"],
    ];
    for (const [ingName, depotCode, price] of demoPrices) {
      const ingredientId = ingredientIds.get(ingName)!;
      const depotId = depotIds.get(depotCode)!;
      const existing = await db.query.ingredientPrices.findFirst({
        where: and(
          eq(ingredientPrices.ingredientId, ingredientId),
          eq(ingredientPrices.depotId, depotId)
        ),
      });
      if (!existing) {
        await db.insert(ingredientPrices).values({
          ingredientId,
          depotId,
          pricePerUnit: price,
          effectiveDate: "2026-01-01",
        });
      }
    }

    const burger = await db.query.products.findFirst({
      where: eq(products.code, "BURGER-CLASSIC"),
    });
    if (burger) {
      if (!burger.salePriceHT) {
        await db
          .update(products)
          .set({ salePriceHT: "9.00" })
          .where(eq(products.id, burger.id));
      }
      const existingRecipe = await db.query.recipes.findFirst({
        where: eq(recipes.productId, burger.id),
      });
      if (!existingRecipe) {
        const [recipe] = await db
          .insert(recipes)
          .values({ productId: burger.id })
          .returning();
        await db.insert(recipeItems).values([
          {
            recipeId: recipe.id,
            ingredientId: ingredientIds.get("Steak haché")!,
            quantity: "0.0900",
          },
          {
            recipeId: recipe.id,
            ingredientId: ingredientIds.get("Pain burger")!,
            quantity: "1.0000",
          },
          {
            recipeId: recipe.id,
            ingredientId: ingredientIds.get("Cheddar")!,
            quantity: "0.0200",
          },
        ]);
        console.log("Recette Food Cost de démonstration créée (Burger Classic).");
      }
    }
  }

  // ── Formation de démonstration (BM-001) ─────────────────────────
  if (bm001) {
    const existingTraining = await db.query.trainings.findFirst({
      where: eq(trainings.storeId, bm001.id),
    });
    if (!existingTraining) {
      const [training] = await db
        .insert(trainings)
        .values({
          storeId: bm001.id,
          franchiseeId: bm001.franchiseeId,
          trainerId: animateur.id,
          type: "HYGIENE",
          status: "REALISEE",
          trainingDate: new Date().toISOString().slice(0, 10),
          report:
            "Rappel des règles HACCP et du protocole de nettoyage. Équipe attentive, points acquis.",
        })
        .returning();
      await db.insert(trainingParticipants).values([
        { trainingId: training.id, name: "Farid Franchisé" },
        { trainingId: training.id, name: "Karim (équipier)" },
      ]);
      console.log("Formation de démonstration créée (BM-001).");
    }
  }

  // ── Partenaire + tâche communication de démonstration ───────────
  {
    const existingPartner = await db.query.partners.findFirst({
      where: eq(partners.companyName, "Studio Graphik"),
    });
    const partner =
      existingPartner ??
      (
        await db
          .insert(partners)
          .values({
            companyName: "Studio Graphik",
            contactName: "Sophie Créa",
            email: "contact@studiographik.fr",
            domain: "Print & PLV",
            tariffNotes: "Affiche A2 : 180 € HT · PLV comptoir : 90 € HT",
            scopeNotes: "Supports print de tout le réseau.",
            internalNotes: "Remise de 10 % négociée fin 2025 (confidentiel).",
          })
          .returning()
      )[0];

    const communicationUser = await db.query.users.findFirst({
      where: eq(users.email, "communication@bigm.fr"),
    });
    if (bm001 && communicationUser) {
      const existingTask = await db.query.commTasks.findFirst({
        where: eq(commTasks.requesterId, communicationUser.id),
      });
      if (!existingTask) {
        const nextWeek = new Date(Date.now() + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        await db.insert(commTasks).values({
          type: "CAMPAGNE",
          title: "Campagne rentrée — affiches vitrine",
          description: "Décliner la campagne nationale pour les vitrines du réseau.",
          storeId: bm001.id,
          partnerId: partner.id,
          requesterId: communicationUser.id,
          assigneeId: communicationUser.id,
          priority: "HAUTE",
          status: "EN_COURS",
          publicationDate: nextWeek,
        });
        console.log("Tâche communication de démonstration créée.");
      }
    }
  }

  // ── RH : salarié de démonstration (pointeuse) ───────────────────
  {
    const salarieUser = await upsertUser({
      email: "salarie@bigm.fr",
      password: demoPassword,
      firstName: "Sami",
      lastName: "Salarié",
      role: "SALARIE",
    });
    if (bm003) {
      const existingEmployee = await db.query.employees.findFirst({
        where: eq(employees.userId, salarieUser.id),
      });
      if (!existingEmployee) {
        await db.insert(employees).values({
          userId: salarieUser.id,
          storeId: bm003.id,
          firstName: "Sami",
          lastName: "Salarié",
          position: "Équipier polyvalent",
          email: "salarie@bigm.fr",
          contractType: "CDI",
          hireDate: "2024-09-02",
          salaryMonthly: "1820.04",
          hrNotes: "Prévoir le passage référent hygiène en 2027 (confidentiel).",
        });
        console.log("Fiche salarié de démonstration créée (BM-003).");
      }
      const existingSecond = await db.query.employees.findFirst({
        where: and(eq(employees.lastName, "Brigade"), eq(employees.storeId, bm003.id)),
      });
      if (!existingSecond) {
        await db.insert(employees).values({
          storeId: bm003.id,
          firstName: "Louna",
          lastName: "Brigade",
          position: "Cuisinière",
          contractType: "CDD",
          hireDate: "2026-01-15",
          endDate: "2026-12-31",
          salaryMonthly: "1950.00",
        });
      }
    }
  }

  // ── Projet d'ouverture de démonstration (BM-004, en projet) ─────
  {
    const bm004 = await db.query.stores.findFirst({
      where: eq(stores.code, "BM-004"),
    });
    const devUser = await db.query.users.findFirst({
      where: eq(users.email, "developpement@bigm.fr"),
    });
    if (bm004 && devUser) {
      const existingProject = await db.query.openingProjects.findFirst({
        where: eq(openingProjects.storeId, bm004.id),
      });
      if (!existingProject) {
        const [project] = await db
          .insert(openingProjects)
          .values({
            storeId: bm004.id,
            createdById: devUser.id,
            targetOpeningDate: "2027-03-01",
            notes: "Emplacement signé, gros œuvre à planifier.",
          })
          .returning();
        const stepTypes = [
          "DIP",
          "CONTRAT",
          "TRAVAUX",
          "FORMATION",
          "COMMANDES",
          "INSTALLATION",
          "OUVERTURE",
          "SUIVI_J30",
        ] as const;
        await db.insert(openingSteps).values(
          stepTypes.map((step) => ({
            projectId: project.id,
            step,
            ...(step === "DIP"
              ? { status: "TERMINEE" as const, doneDate: "2026-06-15" }
              : step === "CONTRAT"
                ? { status: "EN_COURS" as const, plannedDate: "2026-10-30" }
                : {}),
          }))
        );
        await db.insert(openingChecklistItems).values([
          {
            projectId: project.id,
            label: "Kit PLV d'ouverture",
            pole: "COMMUNICATION",
            dueDate: "2027-02-01",
          },
          {
            projectId: project.id,
            label: "Dossier bancaire complet",
            pole: "COMPTABILITE",
          },
        ]);
        console.log("Projet d'ouverture de démonstration créé (BM-004).");
      }
    }
  }

  // ── Prospection & cessions de démonstration ─────────────────────
  {
    const devUser = await db.query.users.findFirst({
      where: eq(users.email, "developpement@bigm.fr"),
    });
    const existingAgent = await db.query.agents.findFirst({
      where: eq(agents.name, "Immo Centre-Est"),
    });
    const agent =
      existingAgent ??
      (
        await db
          .insert(agents)
          .values({
            name: "Immo Centre-Est",
            agency: "Cabinet Bourdin",
            email: "contact@immo-centre-est.fr",
            zone: "Auvergne-Rhône-Alpes",
          })
          .returning()
      )[0];

    if (devUser) {
      const existingProspect = await db.query.prospects.findFirst({
        where: eq(prospects.lastName, "Reprise"),
      });
      if (!existingProspect) {
        const [prospect] = await db
          .insert(prospects)
          .values({
            firstName: "Karim",
            lastName: "Reprise",
            email: "karim.reprise@mail.fr",
            city: "Annecy",
            targetZone: "Haute-Savoie",
            budget: "180000.00",
            personalContribution: "60000.00",
            leadSource: "Salon de la franchise",
            interestLevel: "FORT",
            status: "QUALIFIE",
            agentId: agent.id,
            assigneeId: devUser.id,
            nextFollowUpDate: "2026-08-01", // dépassée → job prospect-followup
            notes: "Profil restaurateur, apport confirmé.",
          })
          .returning();
        await db.insert(prospectEvents).values({
          prospectId: prospect.id,
          type: "APPEL",
          eventDate: "2026-07-20",
          notes: "Premier échange téléphonique, très motivé.",
          createdById: devUser.id,
        });
        await db.insert(prospects).values({
          firstName: "Sonia",
          lastName: "Candidate",
          city: "Chambéry",
          leadSource: "Site web",
          status: "NOUVEAU",
        });
        console.log("Prospects de démonstration créés.");
      }
    }

    const existingPremises = await db.query.premises.findFirst({
      where: eq(premises.address, "12 rue de la République"),
    });
    if (!existingPremises) {
      await db.insert(premises).values({
        address: "12 rue de la République",
        city: "Annecy",
        postalCode: "74000",
        surfaceM2: "85.0",
        monthlyRent: "2400.00",
        leaseRights: "45000.00",
        status: "DISPONIBLE",
        agentId: agent.id,
        notes: "Angle passant, extraction possible.",
      });
      console.log("Local de démonstration créé.");
    }

    const bm002ForResale = await db.query.stores.findFirst({
      where: eq(stores.code, "BM-002"),
    });
    if (bm002ForResale) {
      const existingResale = await db.query.resaleListings.findFirst({
        where: eq(resaleListings.storeId, bm002ForResale.id),
      });
      if (!existingResale) {
        await db.insert(resaleListings).values({
          storeId: bm002ForResale.id,
          wish: "VENTE_TOTALE",
          askingPrice: "250000.00",
          urgency: "HAUTE",
          notes: "Souhaite céder d'ici 12 mois (confidentiel).",
        });
        console.log("Cession de démonstration créée (BM-002).");
      }
    }
  }

  // ── Dépenses de la succursale BM-003 (rentabilité) ──────────────
  {
    const comptaSeed = await db.query.users.findFirst({
      where: eq(users.email, "compta@bigm.fr"),
    });
    if (bm003 && comptaSeed) {
      const existingExpense = await db.query.storeExpenses.findFirst({
        where: eq(storeExpenses.storeId, bm003.id),
      });
      if (!existingExpense) {
        const monthStart = `${todayParis().slice(0, 7)}-01`;
        await db.insert(storeExpenses).values([
          {
            storeId: bm003.id,
            expenseDate: monthStart,
            category: "LOYER",
            amount: "2400.00",
            label: "Loyer mensuel",
            enteredById: comptaSeed.id,
          },
          {
            storeId: bm003.id,
            expenseDate: monthStart,
            category: "SALAIRES",
            amount: "5200.00",
            label: "Salaires équipe",
            enteredById: comptaSeed.id,
          },
        ]);
        console.log("Dépenses de démonstration créées (BM-003).");
      }
    }
  }

  // ── Flux & budget Big M CIE de démonstration ────────────────────
  {
    const comptaCie = await db.query.users.findFirst({
      where: eq(users.email, "compta@bigm.fr"),
    });
    if (comptaCie) {
      const existingFlow = await db.query.companyFlows.findFirst({
        where: eq(companyFlows.label, "Redevances du réseau"),
      });
      if (!existingFlow) {
        const monthStart = `${todayParis().slice(0, 7)}-01`;
        await db.insert(companyFlows).values([
          {
            flowDate: monthStart,
            category: "REDEVANCE",
            amount: "4500.00",
            label: "Redevances du réseau",
            enteredById: comptaCie.id,
          },
          {
            flowDate: monthStart,
            category: "SALAIRES",
            amount: "6200.00",
            label: "Salaires siège",
            enteredById: comptaCie.id,
          },
          {
            flowDate: monthStart,
            category: "LOGICIELS",
            amount: "350.00",
            label: "Abonnements SaaS",
            enteredById: comptaCie.id,
          },
        ]);
        const [year, month] = [
          Number(todayParis().slice(0, 4)),
          Number(todayParis().slice(5, 7)),
        ];
        await db.insert(companyBudgets).values([
          { year, month, category: "REDEVANCE", amount: "5000.00" },
          { year, month, category: "SALAIRES", amount: "6000.00" },
        ]);
        console.log("Flux et budgets Big M CIE de démonstration créés.");
      }
    }
  }

  // ── Registre des logiciels de démonstration ─────────────────────
  {
    const existingSoftware = await db.query.softwareRegistry.findFirst({
      where: eq(softwareRegistry.name, "Pack bureautique"),
    });
    if (!existingSoftware) {
      await db.insert(softwareRegistry).values({
        name: "Pack bureautique",
        purpose: "Documents, tableurs et messagerie du siège",
        url: "https://office.example.com",
        ownerId: direction.id,
        accessLevelNotes: "Tout le siège ; licences gérées par la direction.",
      });
      console.log("Logiciel de démonstration créé.");
    }
  }

  console.log(`Seed démo terminé (mot de passe commun : ${demoPassword}).`);
  console.log(`Direction : ${direction.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
