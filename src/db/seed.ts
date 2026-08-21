// Seed de la base :
// - toujours : compte administrateur initial (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
// - si SEED_DEMO=true : jeu de démonstration (utilisateurs par rôle, boutiques,
//   franchisés, contrats) — utilisé par le dev local et les tests e2e.
// Idempotent : réexécutable sans doublons.
import { eq } from "drizzle-orm";

import { db, pool } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import {
  contracts,
  franchisees,
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

  console.log(`Seed démo terminé (mot de passe commun : ${demoPassword}).`);
  console.log(`Direction : ${direction.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
