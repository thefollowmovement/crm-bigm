"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filtres des onglets analytiques : chaque changement met à jour l'URL (les
// données sont recalculées côté serveur) en mémorisant l'onglet actif.

export function AnalyticsFilters({
  vue,
  perimetre,
  storeLabel,
  regions,
  granularite,
  annee,
  years,
}: {
  vue: "evolution" | "comparaison";
  perimetre: string;
  storeLabel: string;
  regions: string[];
  granularite?: string;
  annee?: number;
  years?: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    params.set(key, value);
    params.set("vue", vue);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1.5">
        <Label>Périmètre</Label>
        <Select value={perimetre} onValueChange={(v) => setParam("perimetre", v)}>
          <SelectTrigger className="w-64" data-testid="analytics-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="reseau">Réseau entier</SelectItem>
            <SelectItem value="boutique">Boutique : {storeLabel}</SelectItem>
            {regions.map((region) => (
              <SelectItem key={region} value={`region:${region}`}>
                Région : {region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {granularite !== undefined ? (
        <div className="space-y-1.5">
          <Label>Granularité</Label>
          <Select
            value={granularite}
            onValueChange={(v) => setParam("granularite", v)}
          >
            <SelectTrigger className="w-44" data-testid="analytics-granularity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jour">Par jour</SelectItem>
              <SelectItem value="semaine">Par semaine</SelectItem>
              <SelectItem value="mois">Par mois</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {annee !== undefined && years !== undefined ? (
        <div className="space-y-1.5">
          <Label>Année</Label>
          <Select value={String(annee)} onValueChange={(v) => setParam("annee", v)}>
            <SelectTrigger className="w-32" data-testid="analytics-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}
