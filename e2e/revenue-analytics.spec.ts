import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("évolution et comparaison N vs N-1 s'affichent pour la compta", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/ca");

  // Onglet Évolution : le graphique se dessine (SVG recharts) avec les
  // données du seed (CA de BM-003 sur le mois courant).
  await page.getByTestId("tab-evolution").click();
  await expect(page.getByTestId("revenue-chart")).toBeVisible();
  await expect(
    page.getByTestId("revenue-chart").locator("svg").first()
  ).toBeVisible();

  // Changement de granularité : la page recharge et reste sur l'onglet.
  await page.getByTestId("analytics-granularity").click();
  await page.getByRole("option", { name: "Par mois" }).click();
  await expect(page.getByTestId("revenue-chart")).toBeVisible();

  // Onglet N vs N-1 : graphique + tableau des 12 mois avec écarts.
  await page.getByTestId("tab-comparaison").click();
  await expect(page.getByTestId("revenue-comparison")).toBeVisible();
  await expect(
    page.getByTestId("comparison-table").locator("tbody tr")
  ).toHaveCount(12);
});

test("le franchisé est limité à son périmètre dans les filtres analytiques", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await page.goto("/ca?vue=evolution");

  // Le périmètre propose sa région, jamais celles des autres boutiques.
  await page.getByTestId("analytics-scope").click();
  await expect(
    page.getByRole("option", { name: "Région : Auvergne-Rhône-Alpes" })
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Région : Île-de-France" })
  ).toHaveCount(0);
});
