import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("compta : rentabilité BM-003, saisie d'une dépense répercutée au P&L", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);

  await page.goto("/succursales");
  await expect(page.getByTestId("branches-table")).toContainText("BM-003");
  await page.getByRole("link", { name: /BM-003/ }).click();
  await expect(page.getByTestId("branch-title")).toContainText("BM-003");
  // Les dépenses du seed (loyer + salaires) sont là.
  await expect(page.getByTestId("branch-expenses")).toContainText("Loyer mensuel");

  // Nouvelle dépense → apparaît dans la liste et dans le P&L.
  await page.getByTestId("new-expense-button").click();
  await page.getByTestId("expense-category-select").click();
  await page.getByRole("option", { name: "Maintenance" }).click();
  await page.getByTestId("expense-amount-input").fill("150,00");
  await page.locator("#exp-label").fill("Dépannage four (e2e)");
  await page.getByTestId("expense-submit").click();
  await expect(page.getByTestId("branch-expenses")).toContainText(
    "Dépannage four (e2e)"
  );
  await expect(page.getByTestId("branch-pnl")).toBeVisible();

  // L'onglet Rentabilité de la fiche boutique reprend le même P&L.
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-003" }).click();
  await page.getByRole("tab", { name: "Rentabilité" }).click();
  await expect(page.getByTestId("store-rentability")).toBeVisible();
});

test("le module succursales est fermé à l'animation et au franchisé", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await expect(
    page.getByRole("link", { name: "Succursales", exact: true })
  ).toHaveCount(0);
  await page.goto("/succursales");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  await login(page, ACCOUNTS.franchise);
  await page.goto("/succursales");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
