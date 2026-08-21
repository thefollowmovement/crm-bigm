import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("salarié : pointeuse Début/Pause/Reprise/Fin puis demande de congés", async ({
  page,
}) => {
  await login(page, ACCOUNTS.salarie);

  // Accueil minimal du salarié : lien vers son espace, pas de modules réseau.
  await expect(page.getByTestId("goto-mon-espace")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Boutiques", exact: true })
  ).toHaveCount(0);

  await page.goto("/mon-espace");
  await expect(page.getByTestId("clock-state")).toContainText("Journée non commencée");

  await page.getByTestId("clock-DEBUT").click();
  await expect(page.getByTestId("clock-state")).toContainText("Au travail");
  await page.getByTestId("clock-PAUSE").click();
  await expect(page.getByTestId("clock-state")).toContainText("En pause");
  await page.getByTestId("clock-REPRISE").click();
  await expect(page.getByTestId("clock-state")).toContainText("Au travail");
  await page.getByTestId("clock-FIN").click();
  await expect(page.getByTestId("clock-state")).toContainText("Journée non commencée");
  await expect(page.getByTestId("my-timesheet")).toBeVisible();

  // Demande de congés.
  await page.locator("#my-leave-start").fill("2026-11-02");
  await page.locator("#my-leave-end").fill("2026-11-06");
  await page.getByTestId("my-leave-submit").click();
  await expect(page.getByTestId("my-leaves")).toContainText("Demandée");

  // Les modules RH et réseau lui sont interdits.
  await page.goto("/rh/salaries");
  await expect(page.getByTestId("access-denied")).toBeVisible();
  await page.goto("/boutiques");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("RH : saisie et validation d'une demande, fiche salarié avec salaire", async ({
  page,
}) => {
  await login(page, ACCOUNTS.rh);

  // Saisie RH d'une demande pour la cuisinière du seed, puis validation.
  await page.goto("/rh/conges");
  await page.getByTestId("new-leave-button").click();
  await page.getByTestId("leave-employee-select").click();
  await page.getByRole("option", { name: /Louna Brigade/ }).click();
  await page.locator("#leave-start").fill("2026-12-01");
  await page.locator("#leave-end").fill("2026-12-05");
  await page.getByTestId("leave-submit").click();
  await expect(page.getByText("Demande de congés enregistrée.")).toBeVisible();

  const row = page.getByRole("row", { name: /Louna Brigade/ });
  await row.getByTestId("leave-VALIDEE").click();
  await expect(row.getByTestId("leave-status")).toContainText("Validée");

  // Fiche salarié : salaire et notes RH visibles pour la RH.
  await page.goto("/rh/salaries");
  await expect(page.getByTestId("employees-table")).toContainText("Sami Salarié");
  await page.getByRole("link", { name: "Sami Salarié" }).click();
  await expect(page.getByTestId("employee-title")).toContainText("Sami Salarié");
  await expect(page.getByTestId("emp-salary-input")).toHaveValue("1820.04");
  await expect(page.getByTestId("emp-hrnotes-input")).toHaveValue(/confidentiel/);

  // Le pointage du test précédent remonte sur la fiche de Sami.
  await expect(page.getByTestId("employee-timesheet")).toBeVisible();

  // L'animation n'a pas accès au module RH (ni à l'entrée de menu).
  await login(page, ACCOUNTS.animateur);
  await expect(page.getByRole("link", { name: "Salariés", exact: true })).toHaveCount(0);
  await page.goto("/rh/salaries");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
