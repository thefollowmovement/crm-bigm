import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("compta : tableau mensuel Big M CIE, saisie d'un flux", async ({ page }) => {
  await login(page, ACCOUNTS.compta);

  await page.goto("/direction/finances-cie");
  // Seed : redevances 4500 (budget 5000), salaires 6200, logiciels 350.
  await expect(page.getByTestId("cie-statement")).toContainText("Redevances");
  await expect(page.getByTestId("cie-flows")).toContainText("Salaires siège");

  // Nouveau flux de sortie → répercuté dans la liste du mois.
  await page.getByTestId("new-flow-button").click();
  await page.getByTestId("flow-category-select").click();
  await page.getByRole("option", { name: "Frais généraux" }).click();
  await page.getByTestId("flow-amount-input").fill("120,50");
  await page.locator("#flow-label").fill("Fournitures (e2e)");
  await page.getByTestId("flow-submit").click();
  await expect(page.getByTestId("cie-flows")).toContainText("Fournitures (e2e)");

  // Onglet budget : définir un budget sur une catégorie.
  await page.getByRole("tab", { name: "Budget" }).click();
  await page.getByTestId("budget-category-select").click();
  await page.getByRole("option", { name: "Logiciels" }).click();
  await page.getByTestId("budget-amount-input").fill("400,00");
  await page.getByTestId("budget-submit").click();
  await expect(page.getByText("Budget enregistré.")).toBeVisible();
});

test("les finances CIE sont invisibles hors compta/direction", async ({ page }) => {
  await login(page, ACCOUNTS.rh);
  await expect(
    page.getByRole("link", { name: "Finances Big M CIE", exact: true })
  ).toHaveCount(0);
  await page.goto("/direction/finances-cie");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  await login(page, ACCOUNTS.direction);
  await page.goto("/direction/finances-cie");
  await expect(page.getByTestId("cie-result")).toBeVisible();
});
