"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AUDIT_ACTION_LABELS } from "@/lib/labels";

export function AuditFilters({
  tables,
  current,
}: {
  tables: string[];
  current: { table?: string; action?: string; record?: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams);
    if (value === null || value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page");
    router.push(`/hq-18b8ba/audit?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={current.table ?? "all"}
        onValueChange={(v) => setParam("table", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Toutes les tables" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les tables</SelectItem>
          {tables.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={current.action ?? "all"}
        onValueChange={(v) => setParam("action", v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Toutes les actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes les actions</SelectItem>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = new FormData(e.currentTarget).get("record");
          setParam("record", typeof value === "string" && value !== "" ? value : null);
        }}
      >
        <Input
          name="record"
          placeholder="Identifiant d'enregistrement…"
          defaultValue={current.record ?? ""}
          className="w-64"
        />
        <Button type="submit" variant="outline" size="sm">
          Filtrer
        </Button>
      </form>
    </div>
  );
}
