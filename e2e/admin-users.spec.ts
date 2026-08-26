import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin crée un utilisateur qui apparaît dans la liste", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/utilisateurs");

  await page.getByTestId("create-user-button").click();
  await page.getByLabel("Adresse e-mail").fill("nouveau@bigm.fr");
  await page.getByLabel("Mot de passe initial").fill("MotDePasse10!");
  await page.getByLabel("Prénom").fill("Nadia");
  await page.getByLabel("Nom", { exact: true }).fill("Nouvelle");
  await page.getByRole("button", { name: "Créer l'utilisateur" }).click();

  await expect(page.getByTestId("user-row-nouveau@bigm.fr")).toBeVisible();
  await expect(page.getByTestId("user-row-nouveau@bigm.fr")).toContainText(
    "Nadia Nouvelle"
  );
});

test("un rôle non autorisé voit « Accès refusé » sur l'admin utilisateurs", async ({
  page,
}) => {
  await login(page, ACCOUNTS.compta);
  await page.goto("/hq-18b8ba/utilisateurs");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
