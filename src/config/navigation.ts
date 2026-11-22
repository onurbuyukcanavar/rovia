import {
  BookOpenText, CarFront, Compass, Heart, LayoutDashboard, Map, NotebookPen, Radio, Route, Settings, Signpost,
  type LucideIcon,
} from "lucide-react";
import { t } from "@/i18n";

export type NavItem = {
  key: string;
  label: string;
  shortLabel?: string;
  href: string;
  icon: LucideIcon;
  /** Özelliğin etkin olduğu faz. Mevcut fazdan büyükse menüde pasif "Yakında" olarak görünür. */
  phase: number;
};

/** Şu an yayında olan geliştirme fazı. Bir faz tamamlanıp test edildiğinde artırılır. */
export const CURRENT_PHASE = 9;

export const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: t.nav.overview, shortLabel: t.nav.overviewShort, href: "/panel", icon: LayoutDashboard, phase: 1 },
  { key: "map", label: t.nav.map, shortLabel: t.nav.mapShort, href: "/harita", icon: Map, phase: 2 },
  { key: "explore", label: t.nav.explore, shortLabel: t.nav.exploreShort, href: "/kesfet", icon: Compass, phase: 8 },
  { key: "trips", label: t.nav.trips, shortLabel: t.nav.tripsShort, href: "/yolculuklar", icon: Route, phase: 3 },
  { key: "plan", label: t.nav.plan, href: "/planla", icon: Signpost, phase: 3 },
  { key: "record", label: t.nav.record, shortLabel: t.nav.recordShort, href: "/kayit-modu", icon: Radio, phase: 4 },
  { key: "favorites", label: t.nav.favorites, href: "/favoriler", icon: Heart, phase: 5 },
  { key: "journal", label: t.nav.journal, href: "/gunluk", icon: NotebookPen, phase: 6 },
  { key: "travelogues", label: t.nav.travelogues, href: "/seyahatnameler", icon: BookOpenText, phase: 7 },
  { key: "garage", label: t.nav.garage, href: "/garaj", icon: CarFront, phase: 8 },
  { key: "settings", label: t.nav.settings, href: "/ayarlar", icon: Settings, phase: 1 },
];

export const isAvailable = (item: Pick<NavItem, "phase">) => item.phase <= CURRENT_PHASE;

export const navItem = (key: string) => {
  const item = NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown nav item: ${key}`);
  return item;
};
