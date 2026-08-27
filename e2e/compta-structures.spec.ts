import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 46 : référentiel des structures comptables + import multi-formats.

test("compta : création d'une structure puis import du référentiel avec rapport", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.getByRole("link", { name: "Structures", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Clients comptables" })
  ).toBeVisible();

  // Création manuelle.
  await page.getByTestId("new-structure-button").click();
  await page.getByTestId("structure-code").fill("411TEST");
  await page.getByTestId("structure-name").fill("Structure de test");
  await page.getByTestId("structure-submit").click();
  await expect(page.getByText("Structure créée.")).toBeVisible();
  await expect(page.getByTestId("structures-table")).toContainText("411TEST");

  // Import CSV : 1 création, 1 mise à jour du doublon, 1 ligne en erreur.
  await page.getByTestId("import-structures-button").click();
  await page.getByTestId("structures-file").setInputFiles({
    name: "referentiel.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Code;Nom;Ville;Encours disponible",
        "411TEST;Structure de test;Paris;100,00",
        "411IMP;Structure importée;Lyon;0,00",
        ";Ligne sans code;;",
      ].join("\n"),
      "utf8"
    ),
  });
  await page.getByTestId("structures-import-submit").click();
  await expect(page.getByTestId("import-report")).toContainText("1 créée");
  await expect(page.getByTestId("import-report")).toContainText("1 mise à jour");
  await expect(page.getByTestId("import-report")).toContainText("1 en erreur");
  await expect(page.getByTestId("import-report")).toContainText("Ligne 4");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("structures-table")).toContainText("411IMP");
  // L'historique des imports garde le rapport.
  await expect(page.getByText("Derniers imports du référentiel")).toBeVisible();
});

test("le référentiel comptable est réservé à la compta et à la direction", async ({
  page,
}) => {
  await login(page, ACCOUNTS.animateur);
  await expect(
    page.getByRole("link", { name: "Structures", exact: true })
  ).toHaveCount(0);
  await page.goto("/compta/structures");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
