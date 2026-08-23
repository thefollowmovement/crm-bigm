// Aplatit l'arborescence des dossiers en libellés « Parent / Enfant »
// (pour les selects de classement). Pure et testée en unit.
export type FolderNode = { id: string; name: string; parentId: string | null };

export function folderPathLabels(
  folders: FolderNode[]
): { id: string; label: string }[] {
  const byId = new Map(folders.map((f) => [f.id, f]));

  function path(folder: FolderNode): string {
    const segments = [folder.name];
    let current = folder;
    // Garde-fou contre un cycle accidentel : profondeur bornée.
    for (let depth = 0; depth < 20; depth += 1) {
      if (!current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent) break;
      segments.unshift(parent.name);
      current = parent;
    }
    return segments.join(" / ");
  }

  return folders
    .map((f) => ({ id: f.id, label: path(f) }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

// Chaîne des ancêtres (racine → dossier), pour le fil d'Ariane.
export function folderBreadcrumb(
  folders: FolderNode[],
  folderId: string
): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: FolderNode[] = [];
  let current = byId.get(folderId);
  for (let depth = 0; depth < 20 && current; depth += 1) {
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}
