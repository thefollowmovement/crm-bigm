// Sanitisation HTML PURE des comptes rendus riches (étape 54) — testée en
// unit. Politique : liste blanche stricte, sortie RECONSTRUITE de zéro
// (jamais de passage du HTML source), aucun attribut conservé hors
// a[href] et img[src|alt] (et encore, filtrés). Appliquée à l'ÉCRITURE
// (server action) ET à la LECTURE (defense in depth pour les données
// historiques) avant tout dangerouslySetInnerHTML.

// Balises autorisées (fermantes obligatoires, équilibrées par pile).
const ALLOWED_TAGS = new Set([
  "p",
  "strong",
  "em",
  "u",
  "s",
  "h2",
  "h3",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
]);
// Balises « vides » autorisées.
const VOID_TAGS = new Set(["br", "img"]);
// Alias normalisés.
const TAG_ALIASES: Record<string, string> = { b: "strong", i: "em" };
// Contenu ENTIER supprimé (jamais réémis, même échappé).
const DROP_CONTENT_TAGS = new Set(["script", "style", "head", "title", "iframe"]);

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractAttr(rawAttrs: string, name: string): string | null {
  const match = rawAttrs.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? null;
}

// href acceptés : http(s)://…, chemin interne « /… » (mais pas « //… »).
function safeHref(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

// src d'image accepté : UNIQUEMENT un fichier servi par l'app.
function safeImgSrc(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return /^\/api\/files\/[0-9a-f-]{36}$/i.test(value) ? value : null;
}

// La valeur « ressemble à du HTML » (sinon : ancien compte rendu en texte
// brut, à afficher tel quel en pre-wrap).
export function isProbablyHtml(value: string): boolean {
  return /<[a-z][^>]*>/i.test(value);
}

// HTML sans les balises (pour vérifier qu'un compte rendu n'est pas vide).
export function htmlToText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeHtml(input: string): string {
  const out: string[] = [];
  const stack: string[] = [];
  let dropUntil: string | null = null;

  const tokens = input.split(/(<[^>]*>)/g);
  for (const token of tokens) {
    if (token === "") continue;
    if (!token.startsWith("<")) {
      if (dropUntil) continue;
      out.push(escapeText(token));
      continue;
    }

    // Commentaires / doctype / instructions : supprimés.
    if (token.startsWith("<!") || token.startsWith("<?")) continue;
    const match = token.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>$/);
    if (!match) {
      // « < » littéral (ex. « 2 < 3 ») : ce n'est pas une balise — texte.
      if (!dropUntil) out.push(escapeText(token));
      continue;
    }
    const closing = match[1] === "/";
    const rawName = match[2].toLowerCase();
    const name = TAG_ALIASES[rawName] ?? rawName;
    const rawAttrs = match[3] ?? "";

    // Zone à contenu supprimé (script/style…) : on attend sa fermeture.
    if (dropUntil) {
      if (closing && rawName === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_CONTENT_TAGS.has(rawName)) {
      if (!closing) dropUntil = rawName;
      continue;
    }

    if (VOID_TAGS.has(name)) {
      if (closing) continue;
      if (name === "br") {
        out.push("<br>");
      } else {
        const src = safeImgSrc(extractAttr(rawAttrs, "src"));
        if (src) {
          const alt = extractAttr(rawAttrs, "alt") ?? "";
          out.push(`<img src="${src}" alt="${escapeText(alt)}">`);
        }
      }
      continue;
    }

    if (!ALLOWED_TAGS.has(name)) continue; // div, span, font… : balise ignorée

    if (!closing) {
      // Auto-fermeture des li/p successifs (saisie contenteditable).
      if ((name === "li" || name === "p") && stack[stack.length - 1] === name) {
        out.push(`</${stack.pop()!}>`);
      }
      if (name === "a") {
        const href = safeHref(extractAttr(rawAttrs, "href"));
        if (!href) continue; // lien sans href sûr : balise ignorée
        out.push(`<a href="${escapeText(href)}" target="_blank" rel="noreferrer">`);
      } else {
        out.push(`<${name}>`);
      }
      stack.push(name);
    } else {
      // Fermeture équilibrée : referme les balises intermédiaires restées
      // ouvertes, ignore une fermeture orpheline.
      const index = stack.lastIndexOf(name);
      if (index === -1) continue;
      while (stack.length > index) {
        out.push(`</${stack.pop()!}>`);
      }
    }
  }

  while (stack.length > 0) {
    out.push(`</${stack.pop()!}>`);
  }
  return out.join("");
}
