import { tr, type Dictionary } from "./tr";

export const locales = ["tr"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

const dictionaries: Record<Locale, Dictionary> = { tr };

/** Etkin dilin sözlüğünü döndürür. Çok dilli sürümde kullanıcı ayarından (user_settings.locale) okunacak. */
export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale];
}

export const t = getDictionary();
export type { Dictionary };
