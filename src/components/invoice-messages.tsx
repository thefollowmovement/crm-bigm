// Fil de discussion d'une pièce du journal (étape 53) — server component
// partagé entre la vue compta (/compta/factures/[id]) et la vue prestataire
// (/prestataire/factures/[id]).

type Message = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  fromProvider: boolean;
};

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

export function InvoiceMessages({
  messages,
  mineIsProvider,
}: {
  messages: Message[];
  // true côté prestataire (ses messages à droite), false côté compta.
  mineIsProvider: boolean;
}) {
  if (messages.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="invoice-messages-empty">
        Aucun message pour l&apos;instant.
      </p>
    );
  }
  return (
    <ul className="space-y-3" data-testid="invoice-messages">
      {messages.map((message) => {
        const mine = message.fromProvider === mineIsProvider;
        return (
          <li
            key={message.id}
            className={`max-w-[85%] rounded-xl border p-3 text-sm ${
              mine ? "ml-auto bg-accent/50" : "bg-card"
            }`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {message.authorName}
                {message.fromProvider ? " (prestataire)" : " (comptabilité)"}
              </span>
              <span>{DATE_FORMAT.format(message.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </li>
        );
      })}
    </ul>
  );
}
