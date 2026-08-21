import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("la vue contrats liste les échéances, la plus proche d'abord", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/contrats");
  await expect(page.getByTestId("contract-row-BAIL-BM-002")).toBeVisible();
  // le bail à 3 mois est dans la fenêtre d'alerte → badge « Dans N j »
  await expect(
    page.getByTestId("contract-row-BAIL-BM-002").getByText(/Dans \d+ j/)
  ).toBeVisible();
});

test("le job d'alerte remplit la cloche et mène au contrat", async ({ page }) => {
  await login(page, ACCOUNTS.admin);

  // Exécution manuelle du job (endpoint admin)
  const response = await page.request.post("/api/admin/jobs/run", {
    data: { job: "contract-expiry" },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto("/");
  await expect(page.getByTestId("notification-badge")).toBeVisible();

  await page.getByTestId("notification-bell").click();
  await page
    .getByTestId("notification-item")
    .filter({ hasText: "BM-002" })
    .first()
    .click();
  await expect(page.getByTestId("contract-title")).toContainText("Bail");

  // Le job est idempotent : une seconde exécution ne crée pas de doublon
  const before = await page.request.get("/api/notifications");
  const beforeCount = ((await before.json()) as { unread: number }).unread;
  await page.request.post("/api/admin/jobs/run", { data: { job: "contract-expiry" } });
  const after = await page.request.get("/api/notifications");
  expect(((await after.json()) as { unread: number }).unread).toBe(beforeCount);
});

test("création d'un contrat depuis la fiche boutique", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/boutiques");
  await page.getByRole("link", { name: "BM-001" }).click();
  await page.getByRole("tab", { name: "Contrats" }).click();

  await page.getByTestId("new-contract-button").click();
  await page.getByLabel("Référence interne").fill("AVN-E2E-1");
  await page.getByTestId("contract-type").click();
  await page.getByRole("option", { name: "Avenant" }).click();
  await page.getByLabel("Début").fill("2026-01-01");
  await page.getByLabel("Fin", { exact: true }).fill("2033-01-01");
  await page.getByRole("button", { name: "Créer le contrat" }).click();
  await expect(page.getByText("Contrat créé.")).toBeVisible();

  await expect(
    page.getByTestId("store-contracts").getByText("AVN-E2E-1")
  ).toBeVisible();
});

test("l'endpoint d'exécution des jobs est réservé aux admins", async ({ page }) => {
  await login(page, ACCOUNTS.compta);
  const response = await page.request.post("/api/admin/jobs/run", {
    data: { job: "contract-expiry" },
  });
  expect(response.status()).toBe(403);
});
