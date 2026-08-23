import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin lance une sauvegarde, la télécharge puis la supprime", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/sauvegardes");
  await expect(page.getByText("Aucune sauvegarde pour l'instant.")).toBeVisible();

  await page.getByTestId("run-backup-button").click();
  await expect(page.getByText(/Sauvegarde créée \(/)).toBeVisible({
    timeout: 15_000,
  });

  const row = page.locator("tr", { hasText: "Manuelle" }).first();
  await expect(row.getByText("OK", { exact: true })).toBeVisible();

  // Téléchargement authentifié du dump.
  const href = await row
    .locator('[data-testid^="download-backup-"]')
    .getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain(".dump");

  // Suppression : la ligne disparaît (le bouton vit dans la ligne supprimée,
  // on asserte donc l'état final plutôt qu'un toast éphémère).
  await row.locator('[data-testid^="delete-backup-"]').click();
  await expect(page.locator("tr", { hasText: "Manuelle" })).toHaveCount(0);
  await expect(page.getByText("Aucune sauvegarde pour l'instant.")).toBeVisible();
});

test("les sauvegardes sont réservées à l'admin et à la direction", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await expect(
    page.getByRole("link", { name: "Sauvegardes", exact: true })
  ).toHaveCount(0);
  await page.goto("/admin/sauvegardes");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // La direction, elle, y accède (permission backup:manage via ALL).
  await login(page, ACCOUNTS.direction);
  await page.goto("/admin/sauvegardes");
  await expect(page.getByTestId("run-backup-button")).toBeVisible();
  await expect(page.getByTestId("ftp-status")).toContainText("non configuré");
});
