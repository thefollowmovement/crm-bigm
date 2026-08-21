// Variante de badge par statut d'échange — partagé liste / fiche.
export function exchangeStatusVariant(status: string) {
  switch (status) {
    case "OUVERT":
      return "info" as const;
    case "EN_COURS":
      return "warning" as const;
    case "RESOLU":
      return "success" as const;
    default:
      return "secondary" as const;
  }
}
