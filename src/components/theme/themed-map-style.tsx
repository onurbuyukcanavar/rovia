"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { subscribeTheme, type ResolvedTheme } from "@/lib/theme/theme";
import { mapStyleFor } from "@/lib/maps/style";

/** Öğenin etkin teması: en yakın tema adasının / geçiş kuralının color-scheme değeri. */
function themeOf(el: Element): ResolvedTheme {
  return getComputedStyle(el).colorScheme.includes("dark") ? "dark" : "light";
}

/**
 * Haritayı bulunduğu yerin temasına uygun stille çizer: koyu yüzeyde koyu, aydınlıkta açık harita.
 * Tema, sarmalayıcının (display: contents — yerleşimi etkilemez) hesaplanmış color-scheme değerinden okunur;
 * böylece henüz taşınmamış (geçiş kuralıyla aydınlık çizilen) sayfalarda harita da açık kalır.
 * Tema bilinene kadar (ilk boyamadan önceki tek yerleşim geçişi) harita oluşturulmaz: yanlış stil hiç yüklenmez.
 *
 * İkinci argüman (theme) rota/işaret katmanlarının boya renklerini seçmek içindir: koyu haritada mürekkep
 * rengi (#0e1726) çizgi görünmez — açık renk/amber kullanın.
 *
 *   <ThemedMapStyle styleUrl={styleUrl}>{(mapStyle, theme) => <MapView mapStyle={mapStyle} … />}</ThemedMapStyle>
 */
export function ThemedMapStyle({ styleUrl, children }: { styleUrl: string; children: (mapStyle: string, theme: ResolvedTheme) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<ResolvedTheme | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setTheme(themeOf(el));
    read();
    return subscribeTheme(read);
  }, []);
  return <div ref={ref} className="contents">{theme && children(mapStyleFor(styleUrl, theme), theme)}</div>;
}
