"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Filtre du tableau de bord (boutique pour un franchisé multi-boutiques) —
// l'URL pilote le rendu serveur. Le filtre région a disparu avec le module
// CA par canal (étape 52 : le journal comptable n'est pas régionalisé).

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
