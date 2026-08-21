import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { listFamilies, listProducts } from "@/services/products.service";
import { AccessDenied } from "@/components/access-denied";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  CreateFamilyDialog,
  CreateProductDialog,
  ToggleActiveButton,
} from "./product-dialogs";

export const metadata: Metadata = { title: "Produits & familles" };

export default async function ProduitsAdminPage() {
  const user = await requireUser();
  if (!can(user, "product:manage")) return <AccessDenied />;

  const [families, products] = await Promise.all([
    listFamilies(user),
    listProducts(user, { includeInactive: true }),
  ]);
  const activeFamilies = families.filter((f) => f.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Produits &amp; familles</h1>
          <p className="text-sm text-muted-foreground">
            Référentiel des ventes par produit : les codes servent de clé aux
            imports CSV et, plus tard, au Food Cost.
          </p>
        </div>
        <div className="flex gap-2">
          <CreateFamilyDialog />
          <CreateProductDialog
            families={activeFamilies.map((f) => ({ id: f.id, name: f.name }))}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Familles</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="families-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {families.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                      Aucune famille. Créez-en une pour commencer.
                    </TableCell>
                  </TableRow>
                ) : (
                  families.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell>
                        <Badge variant={f.isActive ? "success" : "secondary"}>
                          {f.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ToggleActiveButton
                          kind="family"
                          id={f.id}
                          isActive={f.isActive}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produits</CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="products-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Aucun produit dans le référentiel.
                    </TableCell>
                  </TableRow>
                ) : (
                  products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-sm">{p.code}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.family.name}</TableCell>
                      <TableCell>
                        <Badge variant={p.isActive ? "success" : "secondary"}>
                          {p.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ToggleActiveButton
                          kind="product"
                          id={p.id}
                          isActive={p.isActive}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
