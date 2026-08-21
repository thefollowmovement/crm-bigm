import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { ROLE_LABELS } from "@/lib/labels";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="dashboard-title">
          Bonjour {user.firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Connecté en tant que {ROLE_LABELS[user.role] ?? user.role}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Bienvenue sur le CRM Big M</CardTitle>
          <CardDescription>
            Les indicateurs du réseau s&apos;afficheront ici au fur et à mesure de
            l&apos;activation des modules (boutiques, finances, tickets…).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Utilisez le menu latéral pour accéder aux modules disponibles selon
          vos droits.
        </CardContent>
      </Card>
    </div>
  );
}
