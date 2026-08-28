import { describe, expect, it } from "vitest";

import {
  htmlToText,
  isProbablyHtml,
  sanitizeHtml,
} from "@/lib/html/sanitize";

describe("sanitisation des comptes rendus riches (étape 54)", () => {
  it("conserve la mise en forme autorisée et normalise b/i", () => {
    expect(
      sanitizeHtml("<p>Un <b>point</b> <i>fort</i> et <u>souligné</u></p>")
    ).toBe("<p>Un <strong>point</strong> <em>fort</em> et <u>souligné</u></p>");
    expect(sanitizeHtml("<ul><li>Un</li><li>Deux</li></ul>")).toBe(
      "<ul><li>Un</li><li>Deux</li></ul>"
    );
    expect(sanitizeHtml("<h2>Titre</h2>ligne 1<br>ligne 2")).toBe(
      "<h2>Titre</h2>ligne 1<br>ligne 2"
    );
  });

  it("neutralise les vecteurs XSS classiques", () => {
    // script : contenu ENTIER supprimé.
    expect(sanitizeHtml('avant<script>alert("x")</script>après')).toBe(
      "avantaprès"
    );
    // gestionnaires d'événements et styles : aucun attribut ne survit.
    expect(sanitizeHtml('<p onclick="alert(1)" style="color:red">ok</p>')).toBe(
      "<p>ok</p>"
    );
    // javascript: refusé sur les liens, la balise disparaît.
    expect(sanitizeHtml('<a href="javascript:alert(1)">clic</a>')).toBe("clic");
    // img hors /api/files : supprimée (pas d'exfiltration via src).
    expect(sanitizeHtml('<img src="https://evil.tld/p.png" onerror="x">')).toBe("");
    // balises inconnues ignorées, texte échappé.
    expect(sanitizeHtml("<svg/onload=alert(1)>")).toBe("");
    expect(sanitizeHtml("2 < 3 & 4 > 1")).toBe("2 &lt; 3 &amp; 4 &gt; 1");
  });

  it("liens : http(s) et chemins internes seulement, rel/target forcés", () => {
    expect(sanitizeHtml('<a href="https://exemple.fr">site</a>')).toBe(
      '<a href="https://exemple.fr" target="_blank" rel="noreferrer">site</a>'
    );
    expect(sanitizeHtml('<a href="/compta/factures">journal</a>')).toBe(
      '<a href="/compta/factures" target="_blank" rel="noreferrer">journal</a>'
    );
    // protocole relatif « //evil.tld » refusé.
    expect(sanitizeHtml('<a href="//evil.tld">x</a>')).toBe("x");
  });

  it("images : uniquement les fichiers servis par l'app", () => {
    const src = "/api/files/123e4567-e89b-42d3-a456-426614174000";
    expect(sanitizeHtml(`<img src="${src}" alt="Ticket">`)).toBe(
      `<img src="${src}" alt="Ticket">`
    );
    expect(sanitizeHtml('<img src="/api/files/../secret">')).toBe("");
  });

  it("équilibre les balises (fermetures manquantes ou orphelines)", () => {
    expect(sanitizeHtml("<p><strong>gras")).toBe("<p><strong>gras</strong></p>");
    expect(sanitizeHtml("</strong>seul</p>")).toBe("seul");
    expect(sanitizeHtml("<ul><li>a<li>b</ul>")).toBe(
      "<ul><li>a</li><li>b</li></ul>"
    );
  });

  it("helpers : détection HTML et texte brut", () => {
    expect(isProbablyHtml("<p>x</p>")).toBe(true);
    expect(isProbablyHtml("2 < 3 mais pas de balise")).toBe(false);
    expect(htmlToText("<p>Un <strong>mot</strong>&nbsp;!</p>")).toBe("Un mot !");
    expect(htmlToText("<p><br></p>")).toBe("");
  });
});
