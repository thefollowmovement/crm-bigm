import type { Metadata } from "next";
import Link from "next/link";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatDateFr } from "@/lib/dates";
import { OPENING_PROJECT_STATUS_LABELS } from "@/lib/labels";
import { listProjects } from "@/services/openings.service";
import { listStores } from "@/services/stores.service";
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

import { CreateProjectDialog } from "./opening-components";

export const metadata: Metadata = { title: "Ouvertures" };

export default async function OpeningsPage() {
  const user = await requireUser();
  if (!can(user, "opening:read")) return <AccessDenied />;

  const canWrite = can(user, "opening:write");
  const [projects, stores] = await Promise.all([
    listProjects(user),
    canWrite ? listStores(user) : Promise.resolve([]),
  ]);
  const projectStoreIds = new Set(projects.map((p) => p.storeId));
  const candidateStores = stores.filter(
    (s) =>
      s.type === "FRANCHISE" && s.status === "EN_PROJET" && !projectStoreIds.has(s.id)
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Ouvertures de franchise</h1>
          <p className="text-sm text-muted-foreground">
            Parcours DIP → contrat → travaux → formation → ouverture → J+30,
            avec checklist collaborative par pôle.
          </p>
        </div>
        {canWrite ? (
          <CreateProjectDialog
            stores={candidateStores.map((s) => ({
              id: s.id,
              label: `${s.code} — ${s.name}`,
            }))}
          />
        ) : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="openings-table">
          <TableHeader>
            <TableRow>
              <TableHead>Boutique</TableHead>
              <TableHead>Ville</TableHead>
              <TableHead>Avancement</TableHead>
              <TableHead>Ouverture visée</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Aucun projet d&apos;ouverture.
                </TableCell>
              </TableRow>
            ) : (
              projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>
                    <Link
                      href={`/developpement/ouvertures/${project.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {project.store.code} — {project.store.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {project.store.city ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">
                      {project.progress.done}/{project.progress.total} jalons
                    </span>{" "}
                    <span className="text-muted-foreground">
                      ({project.progress.pct} %)
                    </span>
                  </TableCell>
                  <TableCell>
                    {project.targetOpeningDate
                      ? formatDateFr(project.targetOpeningDate)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        project.status === "TERMINE"
                          ? "success"
                          : project.status === "ABANDONNE"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {OPENING_PROJECT_STATUS_LABELS[project.status]}
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
