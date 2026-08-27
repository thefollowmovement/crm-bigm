import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, validateSessionToken } from "@/lib/auth/session";
import { can } from "@/lib/authz/permissions";
import { todayParis } from "@/lib/dates";
import {
  listStructuresWithAggregates,
  type StructureWithAggregates,
} from "@/services/acct-invoices.service";
import { ACCT_STRUCTURE_TYPE_LABELS } from "@/lib/labels";
import type { acctStructures } from "@/db/schema";

export const dynamic = "force-dynamic";

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Export CSV de la liste des clients comptables avec leurs agrégats
// (cdc Besoin 3 §4.2) — mêmes filtres que l'écran /compta/structures.
export async function GET(request: Request) {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSessionToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  if (!can(user, "accounting:read")) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const url = new URL(request.url);
  const year = todayParis().slice(0, 4);
  const du = url.searchParams.get("du") ?? "";
  const au = url.searchParams.get("au") ?? "";
  const typeParam = url.searchParams.get("type") ?? "";
  const statut = url.searchParams.get("statut");

  const rows = await listStructuresWithAggregates(user, {
    from: /^\d{4}-\d{2}-\d{2}$/.test(du) ? du : `${year}-01-01`,
    to: /^\d{4}-\d{2}-\d{2}$/.test(au) ? au : `${year}-12-31`,
    q: url.searchParams.get("q"),
    type:
      typeParam in ACCT_STRUCTURE_TYPE_LABELS
        ? (typeParam as (typeof acctStructures.$inferSelect)["type"])
        : null,
    active:
      statut === "actives" || statut === "inactives" ? statut : null,
    impayes: url.searchParams.get("impayes") === "1",
  });

  const header = [
    "Code",
    "Nom",
    "Société",
    "Type",
    "Ville",
    "Active",
    "Encours disponible",
    "Nb pièces",
    "CA HT",
    "Charges HT",
    "Résultat",
    "Restant dû TTC",
    "Dernière pièce",
  ];
  const lines = rows.map((s: StructureWithAggregates) =>
    [
      s.code,
      s.name,
      s.company,
      ACCT_STRUCTURE_TYPE_LABELS[s.type] ?? s.type,
      s.city,
      s.isActive ? "oui" : "non",
      s.creditAvailable,
      s.pieceCount,
      s.revenueHT,
      s.expensesHT,
      s.result,
      s.amountDue,
      s.lastPieceDate,
    ]
      .map(csvCell)
      .join(";")
  );
  const csv = "\uFEFF" + [header.join(";"), ...lines].join("\r\n") + "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients-comptables.csv"`,
    },
  });
}
