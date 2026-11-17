/** Hesap ve veriler: veri indirme (KVKK m. 11) ve hesap silme metinleri. */
export const account = {
  title: "Hesap ve veriler",
  body: "Verilerinin bir kopyasını indirebilir veya hesabını tüm verileriyle birlikte kalıcı olarak silebilirsin.",
  export: {
    title: "Verilerimi indir",
    body:
      "Hesabına ait tüm kayıtlar (profil, ayarlar, araçlar, yolculuklar, duraklar, GPS kayıtları, favoriler, notlar, seyahatnameler, paylaşımlar ve fotoğraf bilgileri) tek bir JSON dosyası olarak indirilir.",
    photosNote:
      "Fotoğraf dosyaları bu dosyaya gömülmez; her fotoğraf için 24 saat geçerli bir indirme bağlantısı dosyada yer alır.",
    button: "Verilerimi indir",
    pending: "Hazırlanıyor…",
    done: "Dosyan indirildi.",
    errors: {
      rateLimited: "Çok sık indirme denendi. Biraz bekleyip tekrar dene.",
      failed: "Verilerin hazırlanamadı. Lütfen tekrar dene.",
      network: "Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.",
    },
  },
  delete: {
    title: "Hesabımı sil",
    body: "Hesabın ve ona bağlı tüm veriler kalıcı olarak silinir. Bu işlem geri alınamaz.",
    open: "Hesabımı sil…",
    dialogTitle: "Hesabını kalıcı olarak sil",
    intro: "Hesabını sildiğinde aşağıdakilerin tamamı kalıcı olarak silinir:",
    items: [
      "tüm yolculukların, planların, durakların ve GPS kayıtların",
      "yüklediğin tüm fotoğraflar",
      "günlük notların, favorilerin ve araçların",
      "seyahatnamelerin ve tüm sürümleri",
      "paylaşım bağlantıların (paylaştığın sayfalar artık açılmaz)",
      "profilin, ayarların ve giriş bilgilerin",
    ],
    irreversible: "Bu işlem geri alınamaz. Silmeden önce verilerini indirmeni öneririz.",
    reauthNote: "Güvenliğin için son 15 dakika içinde giriş yapmış olman gerekir.",
    confirmPhrase: "HESABIMI SİL",
    confirmLabel: (phrase: string) => `Onaylamak için “${phrase}” yaz`,
    submit: "Hesabımı kalıcı olarak sil",
    cancel: "Vazgeç",
    steps: {
      checking: "Oturumun doğrulanıyor…",
      media: (done: number, total: number) => `Fotoğraflar siliniyor… (${done}/${total})`,
      account: "Hesabın siliniyor…",
      done: "Hesabın silindi. Yönlendiriliyorsun…",
    },
    reauth: {
      title: "Yeniden giriş gerekiyor",
      body: "Güvenliğin için yeniden giriş yapman gerekiyor. Giriş yaptıktan sonra bu sayfaya döneceksin ve silme işlemini 15 dakika içinde tamamlayabilirsin.",
      button: "Çıkış yap ve yeniden giriş yap",
    },
    errors: {
      confirm: "Onay ifadesi eşleşmiyor.",
      mediaRemaining: "Bazı fotoğraflar henüz silinemedi. Hesabın silinmedi; tekrar deneyebilirsin.",
      media: "Fotoğraflar silinirken bir sorun oluştu. Hesabın silinmedi; tekrar deneyebilirsin.",
      network: "Bağlantı kurulamadı. Hesabın silinmedi; bağlantını kontrol edip tekrar dene.",
      failed: "Hesap silinemedi. Lütfen tekrar dene; sorun sürerse bize e-posta ile ulaş.",
      retry: "Tekrar dene",
    },
  },
  deletedBanner: "Hesabın ve tüm verilerin silindi. ROVIA’yı kullandığın için teşekkürler.",
} as const;
