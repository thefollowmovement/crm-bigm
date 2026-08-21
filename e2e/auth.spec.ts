import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("un visiteur non connecté est redirigé vers la connexion", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/connexion/);
});

test("un mauvais mot de passe affiche une erreur générique", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(ACCOUNTS.admin.email);
  await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
  await expect(page).toHaveURL(/\/connexion/);
});

test("un compte désactivé ne peut pas se connecter", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(ACCOUNTS.inactif.email);
  await page.getByLabel("Mot de passe").fill(ACCOUNTS.inactif.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("Identifiants incorrects.")).toBeVisible();
});

test("connexion puis déconnexion", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await expect(page.getByTestId("dashboard-title")).toContainText("Bonjour");

  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout-button").click();
  await expect(page).toHaveURL(/\/connexion/);

  // La zone applicative est à nouveau protégée.
  await page.goto("/");
  await expect(page).toHaveURL(/\/connexion/);
});
