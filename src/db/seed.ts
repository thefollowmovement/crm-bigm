// Seed de la base :
// - toujours : compte administrateur initial (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
// - si SEED_DEMO=true : jeu de démonstration (utilisateurs par rôle, boutiques,
//   franchisés, contrats) — utilisé par le dev local et les tests e2e.
// Idempotent : réexécutable sans doublons.
import "@/lib/load-env";

import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import {
  contracts,
  exchangeMessages,
  exchanges,
  franchisees,
  invoices,
  payments,
  reminders,
  revenueEntries,
  stores,
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
  ];

  for (const s of demoStores) {
    const existing = await db.query.stores.findFirst({ where: eq(stores.code, s.code) });
    if (existing) continue;
    const [store] = await db
      .insert(stores)
      .values({ ...s, internalNotes: "Notes internes siège (démo)." })
      .returning();
    console.log(`Boutique créée : ${store.code} ${store.name}`);
    if (s.type === "FRANCHISE") {
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
        [
          [`${month}-01`, "SUR_PLACE", "1850.50", null],
          [`${month}-01`, "UBER_EATS", "620.00", "545.60"],
          [`${month}-02`, "SUR_PLACE", "2104.00", null],
          [`${month}-02`, "EMPORTE", "410.30", null],
        ].map(([date, channel, gross, net]) => ({
          storeId: bm003.id,
          date: date as string,
          channel: channel as "SUR_PLACE" | "UBER_EATS" | "EMPORTE",
          grossAmount: gross as string,
          netAmount: net,
          source: "SAISIE" as const,
          enteredById: comptaUser.id,
        }))
      );
      console.log("CA de démonstration créé (BM-003).");
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
