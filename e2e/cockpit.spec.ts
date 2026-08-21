import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("direction : cockpit avec KPI réseau, graphe et top/flop", async ({ page }) => {
  await login(page, ACCOUNTS.direction);

  await page.goto("/direction/cockpit");
  await expect(page.getByTestId("cockpit-title")).toBeVisible();
  await expect(page.getByTestId("kpi-network-revenue")).toBeVisible();
  await expect(page.getByTestId("kpi-late-plans")).toBeVisible();
  await expect(page.getByTestId("cockpit-chart")).toBeVisible();
  await expect(page.getByTestId("cockpit-top")).toContainText("BM-");
});

test("écart matière visible sur /foodcost, cockpit réservé à la direction", async ({
  page,
}) => {
  // La compta lit l'écart matière (BM-003 : ventes produits + recette seed).
  await login(page, ACCOUNTS.compta);
  await page.goto("/foodcost");
  await page.getByTestId("tab-ecart").click();
  await expect(page.getByTestId("variance-table")).toContainText("BM-003");

  // …mais pas le cockpit (permission direction:cockpit).
  await expect(
    page.getByRole("link", { name: "Cockpit", exact: true })
  ).toHaveCount(0);
  await page.goto("/direction/cockpit");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Franchisé : ni cockpit, ni food cost.
  await login(page, ACCOUNTS.franchise);
  await page.goto("/direction/cockpit");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
