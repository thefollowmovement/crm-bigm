export function invoiceStatusVariant(status: string) {
  switch (status) {
    case "PAYEE":
      return "success" as const;
    case "PARTIELLEMENT_PAYEE":
      return "info" as const;
    case "ANNULEE":
      return "secondary" as const;
    default:
      return "warning" as const;
  }
}
