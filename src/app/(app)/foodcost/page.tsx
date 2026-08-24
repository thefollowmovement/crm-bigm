import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { can } from "@/lib/authz/permissions";
import { formatEUR } from "@/lib/money";
import { todayParis } from "@/lib/dates";
import { formatMonthFr } from "@/lib/analytics";
import {
  getApplicablePrices,
  getFoodCostBoard,
  getMenuBoard,
  listIngredients,
  listRecipes,
} from "@/services/foodcost.service";
import { purchaseThresholds } from "@/lib/jobs/purchase-anomaly";
import { getMaterialVariance } from "@/services/material-variance.service";
import { listDepots } from "@/services/purchases.service";
import { listProducts } from "@/services/products.service";
import { AccessDenied } from "@/components/access-denied";
import { InfoHint } from "@/components/info-hint";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  CreateMenuForm,
  CreateRecipeForm,
  DeleteMenuButton,
  IngredientDialog,
  MenuItemForm,
  MenuSalePriceForm,
  PriceDialog,
  RecipeItemForm,
  RemoveMenuItemButton,
  RemoveRecipeItemButton,
  SalePriceForm,
  ToggleIngredientButton,
  UNIT_LABELS,
} from "./foodcost-components";

export const metadata: Metadata = { title: "Food Cost" };

// Affiche une quantité stockée en unité de base : 0.1500 kg → "150 g".
function formatQuantity(quantity: string, unit: string): string {
  if (unit === "PIECE") {
    return `${quantity.replace(/\.?0+$/, "").replace(".", ",")} pce`;
  }
  const grams = (Number(quantity) * 1000).toFixed(1).replace(/\.0$/, "");
  return unit === "KG" ? `${grams} g` : `${grams} ml`;
}

function formatUnitPrice(price: string): string {
  return `${price.replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")} €`;
}

export default async function FoodCostPage() {
  const user = await requireUser();
  if (!can(user, "foodcost:read")) return <AccessDenied />;

  const canWrite = can(user, "foodcost:write");
  const today = todayParis();
  const [year, month] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const [ingredients, depots, prices, recipes, products, board, variance, menuBoard] =
    await Promise.all([
      listIngredients(user, { includeInactive: true }),
      listDepots(user),
      getApplicablePrices(user),
      listRecipes(user),
      listProducts(user),
      getFoodCostBoard(user),
      getMaterialVariance(user, year, month),
      getMenuBoard(user),
    ]);

  const withRecipe = new Set(recipes.map((r) => r.productId));
  const productsWithoutRecipe = products.filter((p) => !withRecipe.has(p.id));
  const activeIngredients = ingredients.filter((i) => i.isActive);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Food Cost</h1>
          <p className="text-sm text-muted-foreground">
            Ingrédients, tarifs par dépôt et recettes — le coût matière est
            recalculé, jamais stocké.
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <IngredientDialog />
            <PriceDialog
              ingredients={activeIngredients.map((i) => ({
                id: i.id,
                label: `${i.name} (${UNIT_LABELS[i.unit]})`,
              }))}
              depots={depots.map((d) => ({ id: d.id, label: `${d.code} — ${d.name}` }))}
              canCreateDepot={can(user, "purchase:write")}
            />
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="ingredients">
        <TabsList>
          <TabsTrigger value="ingredients">Ingrédients</TabsTrigger>
          <TabsTrigger value="recettes" data-testid="tab-recettes">
            Recettes
          </TabsTrigger>
          <TabsTrigger value="synthese" data-testid="tab-synthese">
            Synthèse
          </TabsTrigger>
          <TabsTrigger value="menus" data-testid="tab-menus">
            Menus
          </TabsTrigger>
          <TabsTrigger value="ecart" data-testid="tab-ecart">
            Écart matière
          </TabsTrigger>
        </TabsList>

        <TabsContent value="menus" className="mt-4 space-y-6">
          {canWrite ? <CreateMenuForm /> : null}
          {menuBoard.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucun menu — composez une formule (burger + frites + boisson +
              emballages) pour suivre son coût matière global.
            </p>
          ) : (
            menuBoard.map((menu) => (
              <Card key={menu.menuId} data-testid={`menu-card-${menu.name}`}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle>
                    {menu.name}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      prix de vente HT :
                    </span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {canWrite ? (
                      <>
                        <MenuSalePriceForm
                          menuId={menu.menuId}
                          salePriceHT={menu.salePriceHT}
                        />
                        <DeleteMenuButton menuId={menu.menuId} />
                      </>
                    ) : (
                      <span className="text-sm font-medium">
                        {menu.salePriceHT ? formatEUR(menu.salePriceHT) : "—"}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {menu.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Menu vide — ajoutez des produits et emballages.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Composant</TableHead>
                          <TableHead className="text-right">Quantité</TableHead>
                          {canWrite ? <TableHead /> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {menu.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.label}
                              {item.kind === "INGREDIENT" ? (
                                <Badge variant="secondary" className="ml-2 text-[10px]">
                                  Emballage / ingrédient
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.kind === "PRODUIT"
                                ? `× ${Number(item.quantity)}`
                                : formatQuantity(item.quantity, item.unit ?? "PIECE")}
                            </TableCell>
                            {canWrite ? (
                              <TableCell className="text-right">
                                <RemoveMenuItemButton itemId={item.id} />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  <div
                    className="flex flex-wrap gap-4 text-sm"
                    data-testid={`menu-costs-${menu.name}`}
                  >
                    {menu.costs.map((c) => (
                      <div key={c.depotId} className="rounded-lg border px-3 py-2">
                        <div className="text-xs uppercase text-muted-foreground">
                          {c.depotCode}
                        </div>
                        {c.cost === null ? (
                          <div className="text-muted-foreground">tarif manquant</div>
                        ) : (
                          <>
                            <div className="font-semibold">{formatEUR(c.cost)}</div>
                            {c.pct !== null ? (
                              <div className="text-xs text-muted-foreground">
                                {c.pct.replace(".", ",")} % du PV
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {canWrite ? (
                    <MenuItemForm
                      menuId={menu.menuId}
                      products={products
                        .filter((p) => p.isActive)
                        .map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))}
                      ingredients={activeIngredients.map((i) => ({
                        id: i.id,
                        label: i.name,
                        unit: i.unit,
                      }))}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="ecart" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Écart matière — {formatMonthFr(today.slice(0, 7))}{" "}
                <InfoHint
                  text={`Un écart supérieur à ±${purchaseThresholds().maxVariancePct} % déclenche l'alerte « anomalie achats » du mois précédent (job quotidien de 07h20 — seuil réglable via la variable d'environnement MATERIAL_VARIANCE_MAX_PCT).`}
                />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                Consommation théorique (ventes produits × recettes, au tarif du
                dépôt de la boutique) comparée aux achats DPS réels.
              </p>
              {variance.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune boutique évaluable (dépôt, ventes produits et recettes
                  requis).
                </p>
              ) : (
                <Table data-testid="variance-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Boutique</TableHead>
                      <TableHead>Théorique</TableHead>
                      <TableHead>Achats réels</TableHead>
                      <TableHead>Écart</TableHead>
                      <TableHead>Écart %</TableHead>
                      <TableHead>Produits non valorisés</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variance.map((row) => (
                      <TableRow key={row.store.id}>
                        <TableCell className="font-medium">
                          {row.store.code} — {row.store.name}
                        </TableCell>
                        <TableCell>{formatEUR(row.theoretical)}</TableCell>
                        <TableCell>{formatEUR(row.actual)}</TableCell>
                        <TableCell
                          className={
                            row.variance.startsWith("-")
                              ? "text-muted-foreground"
                              : "font-medium text-destructive"
                          }
                        >
                          {formatEUR(row.variance)}
                        </TableCell>
                        <TableCell>
                          {row.variancePct === null
                            ? "—"
                            : `${String(row.variancePct).replace(".", ",")} %`}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.missingProducts.length > 0
                            ? row.missingProducts.join(", ")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ingredients" className="mt-4">
          <div className="rounded-xl border bg-card">
            <Table data-testid="ingredients-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Ingrédient</TableHead>
                  <TableHead>Unité</TableHead>
                  {depots.map((d) => (
                    <TableHead key={d.id} className="text-right">
                      {d.code}
                    </TableHead>
                  ))}
                  <TableHead>Statut</TableHead>
                  {canWrite ? <TableHead /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingredients.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4 + depots.length}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Aucun ingrédient — créez-en pour construire les recettes.
                    </TableCell>
                  </TableRow>
                ) : (
                  ingredients.map((ingredient) => (
                    <TableRow key={ingredient.id}>
                      <TableCell className="font-medium">{ingredient.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {UNIT_LABELS[ingredient.unit]}
                      </TableCell>
                      {depots.map((d) => {
                        const price = prices.get(d.id)?.get(ingredient.id);
                        return (
                          <TableCell key={d.id} className="text-right">
                            {price ? formatUnitPrice(price) : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <Badge variant={ingredient.isActive ? "success" : "secondary"}>
                          {ingredient.isActive ? "Actif" : "Inactif"}
                        </Badge>
                      </TableCell>
                      {canWrite ? (
                        <TableCell className="text-right">
                          <ToggleIngredientButton
                            id={ingredient.id}
                            isActive={ingredient.isActive}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="recettes" className="mt-4 space-y-6">
          {canWrite && productsWithoutRecipe.length > 0 ? (
            <CreateRecipeForm
              products={productsWithoutRecipe.map((p) => ({
                id: p.id,
                label: `${p.code} — ${p.name}`,
              }))}
            />
          ) : null}

          {recipes.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune recette — choisissez un produit ci-dessus pour commencer.
            </p>
          ) : (
            recipes.map((recipe) => (
              <Card key={recipe.id} data-testid={`recipe-${recipe.product.code}`}>
                <CardHeader>
                  <CardTitle>
                    {recipe.product.code} — {recipe.product.name}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({recipe.product.family.name})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {recipe.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun ingrédient dans cette recette.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ingrédient</TableHead>
                          <TableHead className="text-right">Grammage / quantité</TableHead>
                          {canWrite ? <TableHead /> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipe.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.ingredient.name}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatQuantity(item.quantity, item.ingredient.unit)}
                            </TableCell>
                            {canWrite ? (
                              <TableCell className="text-right">
                                <RemoveRecipeItemButton itemId={item.id} />
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {canWrite ? (
                    <RecipeItemForm
                      recipeId={recipe.id}
                      ingredients={activeIngredients.map((i) => ({
                        id: i.id,
                        label: i.name,
                        unit: i.unit,
                      }))}
                    />
                  ) : null}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="synthese" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Coût matière par produit et par dépôt{" "}
                <InfoHint text="Le « % du PV » (food cost) = coût matière de la recette au tarif du dépôt ÷ prix de vente HT du produit. Il n'est jamais stocké : il change dès qu'un tarif, un grammage ou un prix de vente change." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {board.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune recette active.
                </p>
              ) : (
                <Table data-testid="foodcost-board">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead className="text-right">Prix de vente HT</TableHead>
                      {board[0].costs.map((c) => (
                        <TableHead key={c.depotId} className="text-right">
                          {c.depotCode}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.map((row) => (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">
                          {row.name}{" "}
                          <span className="text-xs text-muted-foreground">
                            ({row.code})
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {canWrite ? (
                            <SalePriceForm
                              productId={row.productId}
                              salePriceHT={row.salePriceHT}
                            />
                          ) : row.salePriceHT ? (
                            formatEUR(row.salePriceHT)
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        {row.costs.map((c) => (
                          <TableCell key={c.depotId} className="text-right">
                            {c.cost === null ? (
                              <span className="text-muted-foreground">tarif manquant</span>
                            ) : (
                              <div>
                                <div className="font-medium">{formatEUR(c.cost)}</div>
                                {c.pct !== null ? (
                                  <div className="text-xs text-muted-foreground">
                                    {c.pct.replace(".", ",")} % du PV
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
