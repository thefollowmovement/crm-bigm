import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listPartners } from "@/services/partners.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CreatePartnerDialog } from "./partner-components";

export const metadata: Metadata = { title: "Partenaires" };

export default async function PartenairesPage() {
  const user = await requireUser();
  if (!can(user, "partner:read")) return <AccessDenied />;

  const partners = await listPartners(user, { includeInactive: true });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Partenaires &amp; prestataires</h1>
          <p className="text-sm text-muted-foreground">
            Fiches partenaires : interlocuteur, domaine, tarifs, boutiques
            concernées et historique des tâches.
          </p>
        </div>
        {can(user, "partner:write") ? <CreatePartnerDialog /> : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="partners-table">
          <TableHeader>
            <TableRow>
              <TableHead>Société</TableHead>
              <TableHead>Interlocuteur</TableHead>
              <TableHead>Domaine</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun partenaire.
                </TableCell>
              </TableRow>
            ) : (
              partners.map((partner) => (
                <TableRow key={partner.id}>
                  <TableCell>
                    <Link
                      href={`/partenaires/${partner.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {partner.companyName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {partner.contactName ?? "—"}
                  </TableCell>
                  <TableCell>{partner.domain ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {partner.email ?? partner.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={partner.isActive ? "success" : "secondary"}>
                      {partner.isActive ? "Actif" : "Inactif"}
                    </Badge>
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
