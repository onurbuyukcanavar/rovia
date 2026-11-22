/** Paylaşılan konum (/konum) metinleri: WhatsApp ve diğer uygulamalardan gelen konumlar. */
export const sharedLocation = {
  title: "Paylaşılan konum",
  eyebrow: "Konum",
  description: "WhatsApp'tan ya da başka bir uygulamadan gelen konumu aç, rotanı oluştur.",
  unnamed: "Paylaşılan konum",
  coordinates: "Koordinatlar",
  copy: "Koordinatları kopyala",
  copied: "Kopyalandı",
  approximate: "Yaklaşık konum: bağlantıda yerin kendisi değil, harita görünümü vardı.",
  resolving: "Konum açılıyor…",
  sourceLabel: (s: string) => `Kaynak: ${s}`,
  sources: {
    google: "Google Haritalar", apple: "Apple Haritalar", yandex: "Yandex Haritalar", osm: "OpenStreetMap", here: "HERE",
    waze: "Waze", bing: "Bing Haritalar", geo: "Harita uygulaması", rovia: "ROVIA", coordinates: "Koordinat", link: "Bağlantı",
  } as Record<string, string>,
  actions: {
    route: "Buraya rota oluştur",
    map: "Haritada göster",
    google: "Google Haritalar'da aç",
  },
  paste: {
    title: "Konum bağlantısını yapıştır",
    label: "Konum bağlantısı, mesaj ya da koordinat",
    placeholder: "Ör. https://maps.app.goo.gl/… ya da 41.0082, 28.9784",
    hint: "WhatsApp konum mesajı, Google/Apple/Yandex Haritalar bağlantısı, geo: adresi ya da koordinat yapıştırabilirsin.",
    submit: "Konumu aç",
    clipboard: "Panodan yapıştır",
    clipboardDenied: "Panoya erişilemedi. Metni kutuya uzun basarak yapıştırabilirsin.",
  },
  errors: {
    empty: "Bir konum bağlantısı ya da koordinat yapıştır.",
    notFound: "Bu metinde bir konum bulamadık. Harita bağlantısını ya da koordinatı kontrol et.",
    unresolved: "Bağlantıdaki konum çözülemedi. Bağlantıyı Google Haritalar'da açıp oradan tekrar paylaşmayı dene.",
    timeout: "Bağlantı zamanında çözülemedi. Biraz sonra tekrar dene.",
  },
  search: {
    shared: "Paylaşılan konum",
    openLink: "Bağlantıdaki konumu aç",
    resolving: "Bağlantı çözülüyor…",
  },
  entry: "Paylaşılan konumu aç",
  entryHint: "Harita bağlantısı ya da koordinatı arama kutusuna da yapıştırabilirsin.",
} as const;
