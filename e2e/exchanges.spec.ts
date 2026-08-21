import { expect, test } from "@playwright/test";

import { ACCOUNTS, login } from "./fixtures/auth";

const pdfBuffer = Buffer.from("%PDF-1.4\n% piece jointe e2e\n");

const SUBJECT = "Terrasse été E2E";
const INTERNAL_NOTE = "Note interne e2e : vérifier le bail avant validation";
const DECISION_TEXT = "Décision e2e : accord pour la terrasse sous conditions";

test("cycle complet d'un échange : demande franchisé, note interne, décision, résolution", async ({
  page,
  context,
}) => {
  // ── Le franchisé crée une demande sur BM-001 avec une PJ ──────────
  await login(page, ACCOUNTS.franchise);
  await page.goto("/echanges");

  await page.getByTestId("new-exchange-button").click();
  // Le select boutique est scopé : uniquement les boutiques du franchisé.
  await page.getByTestId("exchange-store-select").click();
  await expect(page.getByRole("option", { name: /BM-001/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /BM-002/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /BM-003/ })).toHaveCount(0);
  await page.getByRole("option", { name: /BM-001/ }).click();

  await page.getByLabel("Sujet").fill(SUBJECT);
  await page.getByLabel("Message").fill("Peut-on installer une terrasse cet été ?");
  await page.getByLabel("Pièces jointes").setInputFiles({
    name: "pj-terrasse.pdf",
    mimeType: "application/pdf",
    buffer: pdfBuffer,
  });
  await page.getByRole("button", { name: "Créer l'échange" }).click();
  await expect(page.getByText("Échange créé.")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(page.getByTestId(`exchange-row-${SUBJECT}`)).toBeVisible();
  await page.getByRole("link", { name: SUBJECT }).click();
  await expect(page.getByTestId("exchange-title")).toContainText(SUBJECT);
  await expect(page.getByTestId("message-1")).toContainText(
    "Peut-on installer une terrasse"
  );
  await expect(page.getByTestId("message-1")).toContainText("pj-terrasse.pdf");

  // Le formulaire du franchisé n'a NI case décision NI case note interne.
  await expect(page.getByTestId("reply-body")).toBeVisible();
  await expect(page.getByTestId("decision-checkbox")).toHaveCount(0);
  await expect(page.getByTestId("internal-note-checkbox")).toHaveCount(0);
  // Ni boutons de statut.
  await expect(page.getByTestId("status-button-RESOLU")).toHaveCount(0);

  // ── L'admin voit la demande, répond en interne puis publiquement ──
  await context.clearCookies();
  await login(page, ACCOUNTS.admin);
  await page.goto("/echanges");
  await expect(page.getByTestId(`exchange-row-${SUBJECT}`)).toBeVisible();
  await page.getByRole("link", { name: SUBJECT }).click();
  await expect(page.getByTestId("exchange-status")).toContainText("Ouvert");

  // Note interne (invisible pour le franchisé)
  await page.getByTestId("reply-body").fill(INTERNAL_NOTE);
  await page.getByTestId("internal-note-checkbox").click();
  await page.getByTestId("reply-submit").click();
  await expect(page.getByTestId("message-2")).toContainText(INTERNAL_NOTE);
  await expect(page.getByTestId("message-2")).toContainText("Note interne");
  // Première réponse siège : l'échange passe En cours.
  await expect(page.getByTestId("exchange-status")).toContainText("En cours");

  // Réponse publique marquée décision
  await page.getByTestId("reply-body").fill(DECISION_TEXT);
  await page.getByTestId("decision-checkbox").click();
  await page.getByTestId("reply-submit").click();
  await expect(page.getByTestId("message-3")).toContainText(DECISION_TEXT);
  await expect(
    page.getByTestId("message-3").getByText("Décision", { exact: true })
  ).toBeVisible();

  // Passage en Résolu
  await page.getByTestId("status-button-RESOLU").click();
  await expect(page.getByTestId("exchange-status")).toContainText("Résolu");

  // ── Le franchisé voit la décision mais jamais la note interne ─────
  await context.clearCookies();
  await login(page, ACCOUNTS.franchise);
  await page.goto("/echanges");
  await page.getByRole("link", { name: SUBJECT }).click();
  await expect(page.getByTestId("exchange-status")).toContainText("Résolu");

  // La réponse publique est le message n°2 côté franchisé (note interne exclue).
  await expect(page.getByTestId("message-2")).toContainText(DECISION_TEXT);
  await expect(
    page.getByTestId("message-2").getByText("Décision", { exact: true })
  ).toBeVisible();

  // La note interne est ABSENTE du HTML (pas seulement masquée).
  const html = await page.content();
  expect(html).not.toContain(INTERNAL_NOTE);
  expect(html).not.toContain("Note interne e2e");

  // Toujours pas de cases décision / note interne pour le franchisé.
  await expect(page.getByTestId("decision-checkbox")).toHaveCount(0);
  await expect(page.getByTestId("internal-note-checkbox")).toHaveCount(0);

  // La PJ du premier message reste téléchargeable avec sa session.
  const href = await page
    .getByTestId("message-1")
    .getByRole("link", { name: "pj-terrasse.pdf" })
    .getAttribute("href");
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("pj-terrasse.pdf");
});
