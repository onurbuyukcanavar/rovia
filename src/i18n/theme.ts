/** Görünüm (tema) ayarı metinleri. */
export const theme = {
  title: "Görünüm",
  body: "ROVIA'nın renk teması. Seçimin bu cihazda hatırlanır ve hemen uygulanır.",
  label: "Tema",
  options: {
    dark: { label: "Koyu", hint: "Gece laciverti" },
    light: { label: "Aydınlık", hint: "Sıcak kâğıt tonları" },
    system: { label: "Sistem", hint: "Cihazının ayarını izler" },
  },
  toggle: { toLight: "Aydınlık temaya geç", toDark: "Koyu temaya geç" },
  systemNow: (resolved: "dark" | "light") => `Şu an cihazın ${resolved === "dark" ? "koyu" : "aydınlık"} modda.`,
} as const;
