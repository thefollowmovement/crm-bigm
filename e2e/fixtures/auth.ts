import { expect, type Page } from "@playwright/test";

// Comptes créés par le seed e2e (voir src/db/seed.ts + scripts/e2e.sh).
export const ACCOUNTS = {
  admin: { email: "admin@bigm.fr", password: "Admin1234!" },
  direction: { email: "direction@bigm.fr", password: "Test1234!" },
  compta: { email: "compta@bigm.fr", password: "Test1234!" },
  animateur: { email: "animateur@bigm.fr", password: "Test1234!" },
  communication: { email: "communication@bigm.fr", password: "Test1234!" },
  rh: { email: "rh@bigm.fr", password: "Test1234!" },
  developpement: { email: "developpement@bigm.fr", password: "Test1234!" },
  franchise: { email: "franchise@bigm.fr", password: "Test1234!" },
  salarie: { email: "salarie@bigm.fr", password: "Test1234!" },
  inactif: { email: "inactif@bigm.fr", password: "Test1234!" },
  // Réservé au parcours « Mon compte » : e-mail/mot de passe modifiés en test.
  profil: { email: "profil@bigm.fr", password: "Test1234!" },
} as const;

export async function login(
  page: Page,
  account: { email: string; password: string }
) {
  // Purge la session précédente : le middleware redirige un utilisateur
  // connecté hors de /connexion (nécessaire pour changer de compte en test).
  await page.context().clearCookies();
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(account.email);
  await page.getByLabel("Mot de passe").fill(account.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
}
