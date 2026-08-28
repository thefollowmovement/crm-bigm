import {
  ArrowLeftRight,
  Bell,
  Calculator,
  Receipt,
  Send,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarOff,
  ChefHat,
  Clock,
  DatabaseBackup,
  GraduationCap,
  Handshake,
  IdCard,
  KeyRound,
  Mail,
  Megaphone,
  MonitorSmartphone,
  Rocket,
  ShoppingCart,
  ClipboardCheck,
  Contact,
  FileText,
  FolderOpen,
  Gauge,
  Landmark,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessagesSquare,
  Package,
  ShieldCheck,
  SlidersHorizontal,
  Store,
  Ticket,
  UserCog,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  // Permission requise pour voir l'entrée (matrice de l'étape 4).
  // null = visible de tout utilisateur connecté.
  permission: string | null;
};

export type NavSection = { title: string | null; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard, permission: null },
      { href: "/notifications", label: "Notifications", icon: Bell, permission: null },
      {
        href: "/mon-espace",
        label: "Mon espace",
        icon: Clock,
        permission: "self:clock",
      },
      {
        href: "/mon-compte",
        label: "Mon compte",
        icon: UserCog,
        permission: null,
      },
    ],
  },
  {
    title: "Réseau",
    items: [
      { href: "/boutiques", label: "Boutiques", icon: Building2, permission: "store:read" },
      { href: "/franchises", label: "Franchisés", icon: Users, permission: "franchisee:read" },
      {
        href: "/succursales",
        label: "Succursales",
        icon: Store,
        permission: "branch:read",
      },
      { href: "/contrats", label: "Contrats", icon: FileText, permission: "contract:read" },
      {
        href: "/echanges",
        label: "Échanges franchisés",
        icon: MessagesSquare,
        permission: "exchange:read",
      },
    ],
  },
  {
    title: "Animation",
    items: [
      {
        href: "/animation/visites",
        label: "Visites & audits",
        icon: ClipboardCheck,
        permission: "visit:read",
      },
      {
        href: "/animation/plans-action",
        label: "Plans d'action",
        icon: ListChecks,
        permission: "actionplan:read",
      },
      {
        href: "/animation/planning",
        label: "Planning",
        icon: CalendarDays,
        permission: "planning:read",
      },
      {
        href: "/animation/animateurs",
        label: "Animateurs",
        icon: Contact,
        permission: "planning:read",
      },
      {
        href: "/animation/formations",
        label: "Formations",
        icon: GraduationCap,
        permission: "training:read",
      },
    ],
  },
  {
    title: "Communication",
    items: [
      {
        href: "/communication",
        label: "Tâches communication",
        icon: Megaphone,
        permission: "commtask:read",
      },
      {
        href: "/partenaires",
        label: "Partenaires",
        icon: Handshake,
        permission: "partner:read",
      },
    ],
  },
  {
    // L'ancien module Finances (factures F-XXXX + CA par canal) a été
    // remplacé par la Comptabilité (journal des pièces) à l'étape 52.
    title: "Achats & Food Cost",
    items: [
      { href: "/achats", label: "Achats DPS", icon: ShoppingCart, permission: "purchase:read" },
      { href: "/foodcost", label: "Food Cost", icon: ChefHat, permission: "foodcost:read" },
    ],
  },
  {
    title: "Comptabilité",
    items: [
      {
        href: "/compta/structures",
        label: "Structures",
        icon: Calculator,
        permission: "accounting:read",
      },
      {
        href: "/compta/factures",
        label: "Journal factures",
        icon: Receipt,
        permission: "accounting:read",
      },
      {
        href: "/compta/transmissions",
        label: "Transmissions",
        icon: Send,
        permission: "transmission:create",
      },
    ],
  },
  {
    title: "Développement",
    items: [
      {
        href: "/developpement/ouvertures",
        label: "Ouvertures",
        icon: Rocket,
        permission: "opening:read",
      },
      {
        href: "/developpement/prospects",
        label: "Prospects",
        icon: UserPlus,
        permission: "development:read",
      },
      {
        href: "/developpement/locaux",
        label: "Locaux",
        icon: MapPin,
        permission: "development:read",
      },
      {
        href: "/developpement/agents",
        label: "Agents immobiliers",
        icon: Briefcase,
        permission: "development:read",
      },
      {
        href: "/developpement/cessions",
        label: "Cessions",
        icon: ArrowLeftRight,
        permission: "resale:read",
      },
    ],
  },
  {
    title: "Ressources humaines",
    items: [
      {
        href: "/rh/salaries",
        label: "Salariés",
        icon: IdCard,
        permission: "hr:read",
      },
      {
        href: "/rh/conges",
        label: "Congés",
        icon: CalendarOff,
        permission: "hr:read",
      },
    ],
  },
  {
    title: "Organisation",
    items: [
      { href: "/tickets", label: "Tickets", icon: Ticket, permission: "ticket:read" },
      { href: "/documents", label: "Documents", icon: FolderOpen, permission: "document:read" },
    ],
  },
  {
    title: "Direction",
    items: [
      {
        href: "/direction/cockpit",
        label: "Cockpit",
        icon: Gauge,
        permission: "direction:cockpit",
      },
      {
        href: "/direction/finances-cie",
        label: "Finances Big M CIE",
        icon: Landmark,
        permission: "company-finance:read",
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        href: "/hq-18b8ba/utilisateurs",
        label: "Utilisateurs",
        icon: Users,
        permission: "user:manage",
      },
      {
        href: "/hq-18b8ba/permissions",
        label: "Droits d'accès",
        icon: SlidersHorizontal,
        permission: "permission:manage",
      },
      {
        href: "/hq-18b8ba/produits",
        label: "Produits & familles",
        icon: Package,
        permission: "product:manage",
      },
      {
        href: "/hq-18b8ba/logiciels",
        label: "Logiciels",
        icon: MonitorSmartphone,
        permission: "software:read",
      },
      {
        href: "/hq-18b8ba/coffre",
        label: "Coffre-fort",
        icon: KeyRound,
        permission: "vault:read",
      },
      {
        href: "/hq-18b8ba/sauvegardes",
        label: "Sauvegardes",
        icon: DatabaseBackup,
        permission: "backup:manage",
      },
      {
        href: "/hq-18b8ba/emails",
        label: "E-mails",
        icon: Mail,
        permission: "email:manage",
      },
      {
        href: "/hq-18b8ba/audit",
        label: "Journal d'audit",
        icon: ShieldCheck,
        permission: "audit:read",
      },
    ],
  },
];
