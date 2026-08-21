import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("la direction voit le dashboard réseau : KPI, classements, graphique, filtre région", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await expect(page.getByTestId("network-dashboard")).toBeVisible();
  await expect(page.getByTestId("kpi-revenue")).toBeVisible();
  await expect(page.getByTestId("top-stores")).toContainText("BM-003");
  await expect(page.getByTestId("dashboard-chart")).toBeVisible();

  // Filtre région : Île-de-France (BM-003) reste, la vue se recharge.
  await page.getByTestId("dashboard-region-filter").click();
  await page.getByRole("option", { name: "Île-de-France" }).click();
  await expect(page.getByTestId("kpi-revenue")).toContainText("Île-de-France");
  await expect(page.getByTestId("top-stores")).toContainText("BM-003");
});

test("le franchisé a une vue boutique scopée, sans blocs finances réseau", async ({
  page,
}) => {
  await login(page, ACCOUNTS.franchise);
  await expect(page.getByTestId("store-dashboard")).toBeVisible();
  await expect(page.getByTestId("kpi-revenue")).toBeVisible();
  await expect(page.getByTestId("network-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("kpi-unpaid")).toHaveCount(0);
});

test("l'animateur voit ses boutiques et son planning de la semaine", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await expect(page.getByTestId("animateur-dashboard")).toBeVisible();
  await expect(page.getByTestId("animateur-stores")).toContainText("BM-001");
  await expect(page.getByText("Créneaux planifiés cette semaine")).toBeVisible();
});

test("un rôle sans revenue:read garde un accueil fonctionnel sans bloc CA", async ({
  page,
}) => {
  await login(page, ACCOUNTS.communication);
  await expect(page.getByTestId("network-dashboard")).toBeVisible();
  await expect(page.getByTestId("kpi-revenue")).toHaveCount(0);
  await expect(page.getByText("Tickets en retard")).toBeVisible();
});
