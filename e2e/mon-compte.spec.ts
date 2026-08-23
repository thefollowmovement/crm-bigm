import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Le compte « profil@bigm.fr » est réservé à ce parcours : son e-mail et son
// mot de passe changent ici sans impacter les autres specs.
test("chaque utilisateur gère ses coordonnées, son e-mail et son mot de passe", async ({
  page,
}) => {
  await login(page, ACCOUNTS.profil);
  await page.goto("/mon-compte");

  // Coordonnées : le téléphone est enregistré.
  await page.getByTestId("account-phone").fill("06 11 22 33 44");
  await page.getByTestId("profile-submit").click();
  await expect(page.getByText("Coordonnées mises à jour.")).toBeVisible();

  // Mot de passe : l'actuel est exigé (mauvaise saisie refusée).
  await page.getByTestId("current-password").fill("MauvaisMdp!999");
  await page.getByTestId("new-password").fill("NouveauMdp!2026");
  await page.getByTestId("confirm-password").fill("NouveauMdp!2026");
  await page.getByTestId("password-submit").click();
  await expect(page.getByText("Mot de passe actuel incorrect.")).toBeVisible();

  // Bonne saisie : changement effectif, reconnexion avec le nouveau mot de passe.
  // (React réinitialise le formulaire après chaque action : on re-remplit tout.)
  await page.getByTestId("current-password").fill(ACCOUNTS.profil.password);
  await page.getByTestId("new-password").fill("NouveauMdp!2026");
  await page.getByTestId("confirm-password").fill("NouveauMdp!2026");
  await page.getByTestId("password-submit").click();
  await expect(
    page.getByText("Mot de passe modifié. Vos autres appareils sont déconnectés.")
  ).toBeVisible();
  await login(page, { email: ACCOUNTS.profil.email, password: "NouveauMdp!2026" });

  // Adresse e-mail : mot de passe (désormais le nouveau) exigé.
  await page.goto("/mon-compte");
  await page.getByTestId("account-email").fill("paule.profil@bigm.fr");
  await page.getByTestId("email-current-password").fill("NouveauMdp!2026");
  await page.getByTestId("email-submit").click();
  await expect(page.getByText("Adresse e-mail mise à jour.")).toBeVisible();
  await expect(page.getByText("paule.profil@bigm.fr ·")).toBeVisible();

  // La connexion fonctionne avec la nouvelle adresse.
  await login(page, { email: "paule.profil@bigm.fr", password: "NouveauMdp!2026" });
});

test("l'admin se connecte en tant qu'un utilisateur, agit avec ses droits, puis revient", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/utilisateurs");

  await page.getByTestId(`impersonate-${ACCOUNTS.franchise.email}`).click();
  // On arrive sur le tableau de bord du franchisé, bannière visible.
  await expect(page.getByTestId("dashboard-title")).toBeVisible();
  await expect(page.getByTestId("impersonation-banner")).toBeVisible();

  // Les droits appliqués sont bien ceux du compte usurpé (pas ceux de l'admin).
  await page.goto("/admin/utilisateurs");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Retour au compte admin.
  await page.getByTestId("impersonation-exit").click();
  await expect(page.getByTestId("create-user-button")).toBeVisible();
  await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);

  // L'aller-retour est tracé dans le journal d'audit.
  await page.goto("/admin/audit");
  await expect(page.getByText("Connexion en tant que").first()).toBeVisible();
});

test("le bouton d'usurpation est réservé à l'ADMIN (invisible pour la direction)", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await page.goto("/admin/utilisateurs");
  await expect(page.getByTestId("create-user-button")).toBeVisible();
  await expect(
    page.getByTestId(`impersonate-${ACCOUNTS.franchise.email}`)
  ).toHaveCount(0);
});
