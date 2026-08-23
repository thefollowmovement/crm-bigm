import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin retire un droit à un rôle, effet immédiat, puis le restaure", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/permissions");
  await expect(page.getByTestId("permissions-matrix")).toBeVisible();

  // Retire « Registre logiciels — consulter » au rôle ANIMATION.
  await page.getByTestId("perm-ANIMATION-software:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  // L'animateur perd l'accès : page refusée ET entrée de menu masquée.
  await login(page, ACCOUNTS.animateur);
  await expect(
    page.getByRole("link", { name: "Logiciels", exact: true })
  ).toHaveCount(0);
  await page.goto("/admin/logiciels");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Restaure la valeur par défaut (l'écart est supprimé).
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/permissions");
  await page.getByTestId("perm-ANIMATION-software:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.animateur);
  await page.goto("/admin/logiciels");
  await expect(page.getByTestId("software-table")).toBeVisible();
});

test("l'admin accorde un droit hors matrice, puis le retire", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/permissions");

  // Accorde « Factures & impayés — consulter » à la COMMUNICATION.
  await page.getByTestId("perm-COMMUNICATION-finance:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.communication);
  await page.goto("/finances");
  await expect(page.getByTestId("access-denied")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Retour au défaut : l'accès disparaît.
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/permissions");
  await page.getByTestId("perm-COMMUNICATION-finance:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.communication);
  await page.goto("/finances");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("la gestion des droits est réservée à l'ADMIN (refusée à la direction)", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await expect(
    page.getByRole("link", { name: "Droits d'accès", exact: true })
  ).toHaveCount(0);
  await page.goto("/admin/permissions");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
