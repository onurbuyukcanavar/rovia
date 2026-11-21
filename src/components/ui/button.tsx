import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-[background,color,box-shadow,transform] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none";
// Renkler globals.css'teki .btn-* bileşen sınıflarındadır: className ile verilen renkler her zaman kazanır.
const variants: Record<Variant, string> = {
  primary: "btn-primary", // temanın ön plan rengiyle dolu (koyuda kâğıt, aydınlıkta mürekkep)
  accent: "btn-accent", // amber; sayfa başına bir ana çağrı
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant, size, className, ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant, size, className, children, ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
