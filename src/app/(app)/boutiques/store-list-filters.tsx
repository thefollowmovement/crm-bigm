"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STORE_STATUS_LABELS, STORE_TYPE_LABELS } from "@/lib/labels";

export function StoreListFilters({
  current,
}: {
  current: { q?: string; type?: string; statut?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === "all" || value === "") params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("q");
          setParam("q", typeof value === "string" ? value : null);
        }}
      >
        <Input
          name="q"
          placeholder="Rechercher (code, nom, ville)…"
          defaultValue={current.q ?? ""}
          className="w-64"
        />
        <Button type="submit" variant="outline" size="sm">
          Rechercher
        </Button>
      </form>

      <Select value={current.type ?? "all"} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les types</SelectItem>
          {Object.entries(STORE_TYPE_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.statut ?? "all"}
        onValueChange={(v) => setParam("statut", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tous les statuts</SelectItem>
          {Object.entries(STORE_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
