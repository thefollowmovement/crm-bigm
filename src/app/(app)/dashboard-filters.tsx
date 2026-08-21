"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filtres du tableau de bord (région pour le réseau, boutique pour un
// franchisé multi-boutiques) — l'URL pilote le rendu serveur.

export function RegionFilter({
  regions,
  current,
}: {
  regions: string[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(value: string) {
    const params = new URLSearchParams(searchParams);
    if (value === "toutes") params.delete("region");
    else params.set("region", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current || "toutes"} onValueChange={apply}>
      <SelectTrigger className="w-64" data-testid="dashboard-region-filter">
        <SelectValue placeholder="Toutes les régions" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="toutes">Toutes les régions</SelectItem>
        {regions.map((region) => (
          <SelectItem key={region} value={region}>
            {region}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StoreFilter({
  stores,
  current,
}: {
  stores: { id: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function apply(value: string) {
    const params = new URLSearchParams(searchParams);
    params.set("boutique", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={current} onValueChange={apply}>
      <SelectTrigger className="w-72" data-testid="dashboard-store-filter">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {stores.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
