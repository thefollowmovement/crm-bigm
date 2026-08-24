import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Entité FRANCHISEUR « Big M CIE » : les dossiers RH rattachés au siège ne
// sont visibles que des membres de l'entité. Dans le seed, seule la
// direction est membre ; la RH le devient en cours de test.
test("les dossiers RH du siège Big M CIE sont réservés aux membres de l'entité", async ({
  page,
}) => {
  // 1. La direction (membre) crée une salariée rattachée au siège.
  await login(page, ACCOUNTS.direction);
  await page.goto("/rh/salaries");
  await page.getByTestId("new-employee-button").click();
  await page.locator("#emp-firstname").fill("Séverine");
  await page.locator("#emp-lastname").fill("Siège");
  await page.locator("#emp-position").fill("Assistante de direction");
  await page.getByTestId("emp-store-select").click();
  await page.getByRole("option", { name: "Siège — Big M CIE" }).click();
  await page.locator("#emp-hiredate").fill("2024-01-08");
  await page.getByTestId("employee-submit").click();
  await expect(page.getByText("Fiche salarié créée.")).toBeVisible();
  await expect(
    page.getByRole("row", { name: /Séverine Siège/ })
  ).toContainText("Siège — Big M CIE");

  // 2. La RH (non-membre) ne voit ni la fiche, ni l'option d'affectation.
  await login(page, ACCOUNTS.rh);
  await page.goto("/rh/salaries");
  await expect(page.getByRole("link", { name: "Séverine Siège" })).toHaveCount(0);
  await page.getByTestId("new-employee-button").click();
  await page.getByTestId("emp-store-select").click();
  await expect(
    page.getByRole("option", { name: "Siège — Big M CIE" })
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // 3. L'admin assigne la RH à l'entité FRANCHISEUR.
  await login(page, ACCOUNTS.admin);
  await page.goto("/admin/utilisateurs");
  await page
    .getByTestId("user-row-rh@bigm.fr")
    .getByTitle("Modifier")
    .click();
  await page
    .getByTestId("franchisor-member-field")
    .getByRole("checkbox")
    .click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByText("Utilisateur mis à jour.")).toBeVisible();

  // 4. La RH, désormais membre, voit la fiche du siège.
  await login(page, ACCOUNTS.rh);
  await page.goto("/rh/salaries");
  await page.getByRole("link", { name: "Séverine Siège" }).click();
  await expect(page.getByTestId("employee-title")).toContainText("Séverine Siège");
});
