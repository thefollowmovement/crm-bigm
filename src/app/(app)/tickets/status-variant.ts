// Variantes de badge partagées pour les statuts type ticket (tickets,
// tâches communication — même machine à états).
export function ticketStatusVariant(status: string) {
  switch (status) {
    case "VALIDE":
      return "success" as const;
    case "TERMINE":
      return "info" as const;
    case "EN_COURS":
      return "warning" as const;
    case "EN_ATTENTE":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}
