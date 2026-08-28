"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Image as ImageIcon,
  Italic,
  List,
  ListOrdered,
  Underline,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

// Éditeur riche minimal (étape 54) : contenteditable + barre d'outils, sans
// dépendance. La valeur HTML transite par un input caché `name` et est
// SANITISÉE côté serveur (lib/html/sanitize.ts) — l'éditeur n'est qu'un
// confort de saisie, jamais une barrière de sécurité.
export function RichTextEditor({
  name,
  initialHtml,
  images = [],
  testId,
}: {
  name: string;
  initialHtml: string;
  // Images proposables (PJ de l'entité) : insérées par référence /api/files.
  images?: { id: string; label: string }[];
  testId?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(initialHtml);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    }
    // Volontairement au montage seulement : ensuite l'utilisateur est maître.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const node = editorRef.current;
    if (!node) return;
    // Éditeur « vide » (juste un <br> ou des blancs) → valeur vide.
    const hasImage = node.querySelector("img") !== null;
    const text = (node.textContent ?? "").trim();
    setValue(text === "" && !hasImage ? "" : node.innerHTML);
  }

  function exec(command: string, arg?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    sync();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Gras"
          data-testid="rte-bold"
          onClick={() => exec("bold")}
        >
          <Bold />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Italique"
          onClick={() => exec("italic")}
        >
          <Italic />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Souligné"
          onClick={() => exec("underline")}
        >
          <Underline />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Titre"
          data-testid="rte-h2"
          onClick={() => exec("formatBlock", "<h2>")}
        >
          <Heading2 />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Liste à puces"
          onClick={() => exec("insertUnorderedList")}
        >
          <List />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Liste numérotée"
          onClick={() => exec("insertOrderedList")}
        >
          <ListOrdered />
        </Button>
        {images.length > 0 ? (
          <Select
            onValueChange={(id) => {
              const image = images.find((i) => i.id === id);
              if (!image) return;
              exec(
                "insertHTML",
                `<img src="/api/files/${image.id}" alt="${image.label.replace(/"/g, "")}">`
              );
            }}
          >
            <SelectTrigger className="h-9 w-56" data-testid="rte-image-select">
              <span className="flex items-center gap-1 text-sm">
                <ImageIcon className="h-4 w-4" /> Insérer une image…
              </span>
            </SelectTrigger>
            <SelectContent>
              {images.map((image) => (
                <SelectItem key={image.id} value={image.id}>
                  {image.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        onInput={sync}
        onBlur={sync}
        data-testid={testId}
        className="min-h-36 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-inside [&_ul]:list-disc [&_ol]:list-inside [&_ol]:list-decimal [&_img]:my-2 [&_img]:max-h-64 [&_img]:rounded-lg"
        suppressContentEditableWarning
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
