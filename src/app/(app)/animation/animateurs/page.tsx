import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listAnimateurs } from "@/services/planning.service";
import { AccessDenied } from "@/components/access-denied";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Animateurs" };

export default async function AnimateursPage() {
  const user = await requireUser();
  if (!can(user, "planning:read")) return <AccessDenied />;

  const animateurs = await listAnimateurs(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Animateurs réseau</h1>
        <p className="text-sm text-muted-foreground">
          Zones, boutiques suivies et fiches individuelles (itinéraire, coût
          kilométrique, statistiques).
        </p>
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="animateurs-table">
          <TableHeader>
            <TableRow>
              <TableHead>Animateur</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead className="text-right">Boutiques suivies</TableHead>
              <TableHead className="text-right">Coût kilométrique</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {animateurs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Aucun animateur actif.
                </TableCell>
              </TableRow>
            ) : (
              animateurs.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link
                      href={`/animation/animateurs/${a.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {a.firstName} {a.lastName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell>{a.profile?.zone ?? "—"}</TableCell>
                  <TableCell className="text-right">{a.storeCount}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {a.profile?.costPerKm
                      ? `${a.profile.costPerKm.replace(".", ",")} €/km`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
