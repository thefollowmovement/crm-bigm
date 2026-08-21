import {
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  ChefHat,
  GraduationCap,
  Handshake,
  Megaphone,
  ShoppingCart,
  ChartLine,
  ClipboardCheck,
  Contact,
  FileText,
  FolderOpen,
  LayoutDashboard,
  ListChecks,
  MessagesSquare,
  Package,
  ShieldCheck,
  Ticket,
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
    ],
  },
  {
    title: "Réseau",
    items: [
      { href: "/boutiques", label: "Boutiques", icon: Building2, permission: "store:read" },
      { href: "/franchises", label: "Franchisés", icon: Users, permission: "franchisee:read" },
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
    title: "Finances",
    items: [
      { href: "/finances", label: "Factures & impayés", icon: Banknote, permission: "finance:read" },
      { href: "/ca", label: "Chiffre d'affaires", icon: ChartLine, permission: "revenue:read" },
      { href: "/achats", label: "Achats DPS", icon: ShoppingCart, permission: "purchase:read" },
      { href: "/foodcost", label: "Food Cost", icon: ChefHat, permission: "foodcost:read" },
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
    title: "Administration",
    items: [
      {
        href: "/admin/utilisateurs",
        label: "Utilisateurs",
        icon: Users,
        permission: "user:manage",
      },
      {
        href: "/admin/produits",
        label: "Produits & familles",
        icon: Package,
        permission: "product:manage",
      },
      {
        href: "/admin/audit",
        label: "Journal d'audit",
        icon: ShieldCheck,
        permission: "audit:read",
      },
    ],
  },
];
