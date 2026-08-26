import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("le journal d'audit montre la connexion de l'admin", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/audit");

  await expect(page.getByTestId("audit-table")).toBeVisible();
  // La connexion qui vient d'avoir lieu est déjà tracée.
  await expect(page.getByText("Connexion", { exact: true }).first()).toBeVisible();
});

test("le filtre par action fonctionne", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/audit?action=LOGIN_FAILED");

  // Aucune connexion échouée pour l'instant (ou uniquement des LOGIN_FAILED) :
  // le tableau ne doit contenir aucune ligne « Connexion » simple.
  await expect(page.getByTestId("audit-table")).toBeVisible();
  await expect(
    page.getByTestId("audit-table").getByText("Connexion", { exact: true })
  ).toHaveCount(0);
});

test("un rôle sans audit:read est refusé", async ({ page }) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/hq-18b8ba/audit");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
