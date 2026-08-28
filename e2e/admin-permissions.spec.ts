import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

test("l'admin retire un droit à un rôle, effet immédiat, puis le restaure", async ({
  page,
}) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/permissions");
  await expect(page.getByTestId("permissions-matrix")).toBeVisible();

  // Retire « Registre logiciels — consulter » au rôle ANIMATION.
  await page.getByTestId("perm-ANIMATION-software:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  // L'animateur perd l'accès : page refusée ET entrée de menu masquée.
  await login(page, ACCOUNTS.animateur);
  await expect(
    page.getByRole("link", { name: "Logiciels", exact: true })
  ).toHaveCount(0);
  await page.goto("/hq-18b8ba/logiciels");
  await expect(page.getByTestId("access-denied")).toBeVisible();

  // Restaure la valeur par défaut (l'écart est supprimé).
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/permissions");
  await page.getByTestId("perm-ANIMATION-software:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.animateur);
  await page.goto("/hq-18b8ba/logiciels");
  await expect(page.getByTestId("software-table")).toBeVisible();
});

test("l'admin accorde un droit hors matrice, puis le retire", async ({ page }) => {
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/permissions");

  // Accorde « Comptabilité — consulter » à la COMMUNICATION.
  await page.getByTestId("perm-COMMUNICATION-accounting:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.communication);
  await page.goto("/compta/structures");
  await expect(page.getByTestId("access-denied")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Retour au défaut : l'accès disparaît.
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/permissions");
  await page.getByTestId("perm-COMMUNICATION-accounting:read").click();
  await expect(page.getByText("Droits mis à jour.").first()).toBeVisible();

  await login(page, ACCOUNTS.communication);
  await page.goto("/compta/structures");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});

test("rôle personnalisé : création, droits ajustés, assignation à un utilisateur", async ({
  page,
}) => {
  // 1. L'admin crée un rôle basé sur RH, retire l'écriture RH, accorde la
  //    comptabilité en lecture.
  await login(page, ACCOUNTS.admin);
  await page.goto("/hq-18b8ba/permissions");
  await page.getByTestId("new-custom-role-button").click();
  await page.getByTestId("custom-role-name").fill("Manager RH junior");
  await page.getByTestId("custom-role-base").click();
  await page.getByRole("option", { name: "Ressources humaines" }).click();
  await page.getByTestId("custom-role-submit").click();
  await expect(page.getByText(/Rôle « Manager RH junior » créé/)).toBeVisible();
  await expect(page.getByTestId("custom-role-chip-Manager RH junior")).toBeVisible();

  // L'état des cases reflète la valeur persistée (re-rendu serveur).
  await page.getByTestId("perm-Manager RH junior-hr:write").click();
  await expect(
    page.getByTestId("perm-Manager RH junior-hr:write")
  ).toHaveAttribute("aria-checked", "false");
  await page.getByTestId("perm-Manager RH junior-accounting:read").click();
  await expect(
    page.getByTestId("perm-Manager RH junior-accounting:read")
  ).toHaveAttribute("aria-checked", "true");

  // 2. Création d'un utilisateur portant ce rôle.
  await page.goto("/hq-18b8ba/utilisateurs");
  await page.getByTestId("create-user-button").click();
  await page.locator("#email").fill("junior.rh@bigm.fr");
  await page.locator("#password").fill("MdpJunior!2026");
  await page.locator("#firstName").fill("Jade");
  await page.locator("#lastName").fill("Junior");
  await page.getByTestId("role-select").click();
  await page.getByRole("option", { name: "Manager RH junior (personnalisé)" }).click();
  await page.getByRole("button", { name: "Créer l'utilisateur" }).click();
  await expect(page.getByText("Utilisateur créé.")).toBeVisible();
  await expect(page.getByTestId("user-row-junior.rh@bigm.fr")).toContainText(
    "Manager RH junior"
  );

  // 3. Le compte hérite de RH… ajusté : lecture RH sans écriture, compta OK.
  await login(page, { email: "junior.rh@bigm.fr", password: "MdpJunior!2026" });
  await page.goto("/rh/salaries");
  await expect(page.getByTestId("employees-table")).toBeVisible();
  await expect(page.getByTestId("new-employee-button")).toHaveCount(0);
  await page.goto("/compta/structures");
  await expect(page.getByTestId("access-denied")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("la gestion des droits est réservée à l'ADMIN (refusée à la direction)", async ({
  page,
}) => {
  await login(page, ACCOUNTS.direction);
  await expect(
    page.getByRole("link", { name: "Droits d'accès", exact: true })
  ).toHaveCount(0);
  await page.goto("/hq-18b8ba/permissions");
  await expect(page.getByTestId("access-denied")).toBeVisible();
});
