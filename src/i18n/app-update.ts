/** Android uygulama içi güncelleme metinleri. */
export const appUpdate = {
  title: (v: string) => `Yeni sürüm hazır (${v})`,
  body: "ROVIA'nın yeni sürümünü uygulamadan çıkmadan kurabilirsin.",
  update: "Güncelle",
  later: "Sonra",
  dismiss: "Bildirimi kapat",
  downloading: (p: number | null) => (p === null || p < 0 ? "İndiriliyor…" : `İndiriliyor… %${p}`),
  verifying: "İndirme doğrulanıyor…",
  installing: "Kurulum ekranı açıldı. “Güncelle”ye dokunarak tamamla.",
  permission: "Android, ROVIA'nın güncelleme kurmasına izin vermeni istiyor: açılan ekranda “Bu kaynaktan izin ver”i aç ve geri dön; kurulum kendiliğinden başlar.",
  permissionDenied: "Kurulum izni verilmedi. Tekrar denemek için “Güncelle”ye dokun.",
  retry: "Tekrar dene",
  errors: {
    signature: "İndirilen dosya doğrulanamadı (imza eşleşmiyor); kurulmadı. Daha sonra tekrar dene.",
    download: "Güncelleme indirilemedi. Bağlantını kontrol edip tekrar dene.",
    generic: "Güncelleme başlatılamadı. Tekrar dene.",
  },
  manual: {
    body: "Bu sürüm bir kez elle güncellenmeli; sonraki güncellemeler uygulama içinden yapılır.",
    download: "APK'yı indir",
  },
} as const;
