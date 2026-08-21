import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr, todayParis } from "@/lib/dates";
import { formatEUR } from "@/lib/money";
import { INTEREST_LEVEL_LABELS, PROSPECT_STATUS_LABELS } from "@/lib/labels";
import {
  isFollowUpDue,
  listAgents,
  listDevMembers,
  listProspects,
} from "@/services/prospects.service";
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

import { CreateProspectDialog, ProspectStatusFilter } from "./prospect-components";

export const metadata: Metadata = { title: "Prospects" };

const STATUSES = Object.keys(PROSPECT_STATUS_LABELS);
type ProspectStatus =
  | "NOUVEAU"
  | "CONTACTE"
  | "QUALIFIE"
  | "RDV"
  | "DIP"
  | "RECHERCHE_LOCAL"
  | "CONTRAT"
  | "OUVERTURE"
  | "ABANDONNE";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user, "development:read")) return <AccessDenied />;

  const params = await searchParams;
  const status =
    typeof params.statut === "string" && STATUSES.includes(params.statut)
      ? (params.statut as ProspectStatus)
      : undefined;

  const canWrite = can(user, "development:write");
  const [prospects, all, agents, devMembers] = await Promise.all([
    listProspects(user, { status }),
    listProspects(user),
    canWrite ? listAgents(user) : Promise.resolve([]),
    canWrite ? listDevMembers(user) : Promise.resolve([]),
  ]);
  const today = todayParis();

  const countByStatus = new Map<string, number>();
  for (const p of all) {
    countByStatus.set(p.status, (countByStatus.get(p.status) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline prospects</h1>
          <p className="text-sm text-muted-foreground">
            Candidats franchisés : du premier contact à l&apos;ouverture.
          </p>
        </div>
        {canWrite ? (
          <CreateProspectDialog
            agents={agents.map((a) => ({ id: a.id, label: a.name }))}
            devMembers={devMembers.map((m) => ({
              id: m.id,
              label: `${m.firstName} ${m.lastName}`,
            }))}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="prospect-pipeline">
        {Object.entries(PROSPECT_STATUS_LABELS).map(([value, label]) => (
          <Badge key={value} variant={value === status ? "default" : "secondary"}>
            {label} : {countByStatus.get(value) ?? 0}
          </Badge>
        ))}
      </div>

      <ProspectStatusFilter current={status ?? ""} />

      <div className="rounded-xl border bg-card">
        <Table data-testid="prospects-table">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Ville / zone</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Intérêt</TableHead>
              <TableHead>Relance</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prospects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun prospect pour ce filtre.
                </TableCell>
              </TableRow>
            ) : (
              prospects.map((prospect) => {
                const due = isFollowUpDue(prospect, today);
                return (
                  <TableRow key={prospect.id}>
                    <TableCell>
                      <Link
                        href={`/developpement/prospects/${prospect.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {prospect.firstName} {prospect.lastName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {prospect.city ?? "—"}
                      {prospect.targetZone ? ` · ${prospect.targetZone}` : ""}
                    </TableCell>
                    <TableCell>
                      {prospect.budget ? formatEUR(prospect.budget) : "—"}
                    </TableCell>
                    <TableCell>
                      {prospect.interestLevel
                        ? INTEREST_LEVEL_LABELS[prospect.interestLevel]
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={due ? "font-medium text-destructive" : ""}>
                        {prospect.nextFollowUpDate
                          ? formatDateFr(prospect.nextFollowUpDate)
                          : "—"}
                        {due ? " (à relancer)" : ""}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          prospect.status === "ABANDONNE" ? "outline" : "secondary"
                        }
                      >
                        {PROSPECT_STATUS_LABELS[prospect.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
