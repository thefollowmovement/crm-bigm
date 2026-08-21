import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listAgents } from "@/services/prospects.service";
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

import { CreateAgentDialog, EditAgentDialog } from "./agent-components";

export const metadata: Metadata = { title: "Agents immobiliers" };

export default async function AgentsPage() {
  const user = await requireUser();
  if (!can(user, "development:read")) return <AccessDenied />;

  const canWrite = can(user, "development:write");
  const agents = await listAgents(user);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Agents immobiliers</h1>
          <p className="text-sm text-muted-foreground">
            Partenaires de la recherche de locaux commerciaux.
          </p>
        </div>
        {canWrite ? <CreateAgentDialog /> : null}
      </div>

      <div className="rounded-xl border bg-card">
        <Table data-testid="agents-table">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead>Zone</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Statut</TableHead>
              {canWrite ? <TableHead /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Aucun agent.
                </TableCell>
              </TableRow>
            ) : (
              agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell className="font-medium">{agent.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.agency ?? "—"}
                  </TableCell>
                  <TableCell>{agent.zone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {agent.email ?? agent.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={agent.isActive ? "success" : "secondary"}>
                      {agent.isActive ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  {canWrite ? (
                    <TableCell>
                      <EditAgentDialog
                        agentId={agent.id}
                        isActive={agent.isActive}
                        values={{
                          name: agent.name,
                          agency: agent.agency,
                          email: agent.email,
                          phone: agent.phone,
                          zone: agent.zone,
                          notes: agent.notes,
                        }}
                      />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
