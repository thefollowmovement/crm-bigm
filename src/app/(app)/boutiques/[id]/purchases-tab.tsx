import type { SessionUser } from "@/lib/auth/session";
import { addMonthsIso, formatDateFr, todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import { formatEUR } from "@/lib/money";
import {
  getPurchasesVsRevenue,
  getStorePurchases,
} from "@/services/purchases.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Onglet « Achats » de la fiche boutique : achats DPS du mois + ratio
// achats/CA sur 12 mois.
export async function StorePurchasesTab({
  user,
  storeId,
}: {
  user: SessionUser;
  storeId: string;
}) {
  const today = todayParis();
  const month = today.slice(0, 7);
  const [purchases, ratio] = await Promise.all([
    getStorePurchases(user, storeId, month),
    getPurchasesVsRevenue(user, {
      from: `${addMonthsIso(today, -11).slice(0, 7)}-01`,
      to: today,
      storeId,
    }),
  ]);

  return (
    <div className="space-y-6" data-testid="store-purchases-tab">
      <Card>
        <CardHeader>
          <CardTitle>
            Achats de {formatMonthFr(month)}
            <span className="ml-3 text-base font-semibold text-brand">
              {formatEUR(purchases.total)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun achat ce mois-ci.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Dépôt</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDateFr(row.date)}</TableCell>
                    <TableCell>{row.depot.code}</TableCell>
                    <TableCell className="font-mono text-sm">{row.reference}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatEUR(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {ratio.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Achats vs CA (12 derniers mois)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mois</TableHead>
                  <TableHead className="text-right">Achats</TableHead>
                  <TableHead className="text-right">CA</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ratio.map((row) => (
                  <TableRow key={row.period}>
                    <TableCell>{formatMonthFr(row.period)}</TableCell>
                    <TableCell className="text-right">
                      {formatEUR(row.purchases)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatEUR(row.revenue)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {row.ratioPct !== null ? `${row.ratioPct.replace(".", ",")} %` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
