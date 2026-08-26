import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

// Étape 45 : vitrine publique « 321 Chicken » qui masque le CRM, lien de
// connexion caché dans le pied de page, /admin renommé en /hq-18b8ba.

test("la vitrine raconte la légende et cache toute trace du CRM", async ({
  page,
}) => {
  await page.goto("/");
  // L'URL reste / (rewrite interne, pas de redirection visible).
  await expect(page).not.toHaveURL(/vitrine|connexion/);
  await expect(page.getByTestId("vitrine-title")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Un poussin nommé Raymond" })
  ).toBeVisible();
  // Les 4 chapitres illustrés sont là.
  await expect(page.locator(".v-chapter-media img")).toHaveCount(4);
  // Aucune mention du CRM sur la page publique.
  await expect(page.locator("body")).not.toContainText(/CRM|Big M/);
});

test("le lien discret « La recette secrète » mène à la connexion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "La recette secrète" }).click();
  await expect(page).toHaveURL(/\/connexion/);
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
});

test("anonyme : les URLs internes (dont l'ancien /admin) ramènent à la vitrine", async ({
  page,
}) => {
  for (const path of ["/finances", "/admin/utilisateurs", "/hq-18b8ba/audit"]) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/connexion/);
    await expect(page.getByTestId("vitrine-title")).toBeVisible();
  }
});

test("connecté : /hq-18b8ba vit, l'ancien /admin est mort", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/utilisateurs");
  await expect(
    page.getByRole("heading", { name: "Utilisateurs", exact: true })
  ).toBeVisible();
  // L'ancienne URL n'existe plus : 404 Next.
  await page.goto("/admin/utilisateurs");
  await expect(page.getByText("404")).toBeVisible();
});
