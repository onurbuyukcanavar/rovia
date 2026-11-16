import { cn } from "@/lib/cn";

export function Avatar({ name, url, size = "md" }: { name: string | null; url: string | null; size?: "sm" | "md" }) {
  const initials = (name ?? "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toLocaleUpperCase("tr-TR")).join("") || "?";
  const cls = cn("shrink-0 rounded-full object-cover", size === "sm" ? "size-8 text-xs" : "size-9 text-sm");
  if (url) {
    // Google profil görselleri: harici kaynak, referrer gönderilmez
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cls} referrerPolicy="no-referrer" />;
  }
  return <span className={cn(cls, "grid place-items-center bg-amber-500 font-bold text-ink-950")} aria-hidden>{initials}</span>;
}
