import { describe, expect, it } from "vitest";

import {
  buildEmailHtml,
  escapeHtml,
  renderTemplate,
} from "@/lib/email/render";

describe("renderTemplate", () => {
  it("remplace les variables connues, avec ou sans espaces", () => {
    expect(
      renderTemplate("Bonjour {{contact_prenom}} {{ contact_nom }}", {
        contact_prenom: "Farid",
        contact_nom: "Franchisé",
      })
    ).toBe("Bonjour Farid Franchisé");
  });

  it("laisse visibles les variables inconnues (repérage des fautes)", () => {
    expect(renderTemplate("{{inconnu}} et {{niveau}}", { niveau: "2" })).toBe(
      "{{inconnu}} et 2"
    );
  });

  it("échappe les valeurs dans le HTML quand demandé, jamais le modèle", () => {
    const out = renderTemplate(
      "<p>{{societe}}</p>",
      { societe: 'SARL <Chicken> & "Co"' },
      { escapeValues: true }
    );
    expect(out).toBe("<p>SARL &lt;Chicken&gt; &amp; &quot;Co&quot;</p>");
  });
});

describe("escapeHtml", () => {
  it("neutralise les 5 caractères spéciaux", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;"
    );
  });
});

describe("buildEmailHtml", () => {
  it("assemble header + corps + signature + footer dans l'ordre", () => {
    const html = buildEmailHtml({
      headerHtml: "<h2>Big M</h2>",
      bodyHtml: "<p>Corps</p>",
      signatureHtml: "<p>La compta</p>",
      footerHtml: "<p>Mentions</p>",
    });
    const iHeader = html.indexOf("<h2>Big M</h2>");
    const iBody = html.indexOf("<p>Corps</p>");
    const iSig = html.indexOf("<p>La compta</p>");
    const iFooter = html.indexOf("<p>Mentions</p>");
    expect(iHeader).toBeGreaterThan(-1);
    expect(iBody).toBeGreaterThan(iHeader);
    expect(iSig).toBeGreaterThan(iBody);
    expect(iFooter).toBeGreaterThan(iSig);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("fonctionne sans header, signature ni footer", () => {
    const html = buildEmailHtml({
      headerHtml: null,
      bodyHtml: "<p>Seul</p>",
      signatureHtml: null,
      footerHtml: null,
    });
    expect(html).toContain("<p>Seul</p>");
    expect(html).not.toContain("border-top");
  });
});
