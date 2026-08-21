import Link from "next/link";

import type { SessionUser } from "@/lib/auth/session";
import { todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import { getBranchPnL } from "@/services/branches.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Onglet « Rentabilité » de la fiche boutique — succursales uniquement,
// visible avec branch:read. Détail et saisie sur /succursales/[id].
export async function StoreRentabilityTab({
  user,
  storeId,
}: {
  user: SessionUser;
  storeId: string;
}) {
  const year = Number(todayParis().slice(0, 4));
  const months = await getBranchPnL(user, storeId, year);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Rentabilité {year}</span>
          <Link
            href={`/succursales/${storeId}`}
            className="text-sm font-normal underline-offset-2 hover:underline"
          >
            Saisie des dépenses →
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune donnée pour {year}.
          </p>
        ) : (
          <Table data-testid="store-rentability">
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead>CA brut</TableHead>
                <TableHead>Achats</TableHead>
                <TableHead>Dépenses</TableHead>
                <TableHead>Résultat</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-medium">{formatMonthFr(m.month)}</TableCell>
                  <TableCell>{formatEUR(m.revenue)}</TableCell>
                  <TableCell>{formatEUR(m.purchases)}</TableCell>
                  <TableCell>{formatEUR(m.expenses)}</TableCell>
                  <TableCell
                    className={
                      m.result.startsWith("-")
                        ? "font-medium text-destructive"
                        : "font-medium"
                    }
                  >
                    {formatEUR(m.result)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
