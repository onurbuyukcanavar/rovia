/** Uygulama kurulumu (ana ekrana ekleme, Android APK), /indir sayfası ve çevrimdışı ekran metinleri. */
export const install = {
  trigger: "Uygulamayı yükle",
  triggerHint: "Ana ekrandan tek dokunuşla aç",
  sheetTitle: "ROVIA'yı telefonuna yükle",
  android: {
    intro: "ROVIA'yı ana ekranına ekle; tam ekran, adres çubuğu olmadan açılır.",
    prompt: "Ana ekrana ekle",
    menuTitle: "Chrome'da ana ekrana ekle",
    menuSteps: ["Sağ üstteki ⋮ menüsüne dokun.", "“Ana ekrana ekle” ya da “Uygulamayı yükle”yi seç.", "“Yükle”ye dokunarak onayla."],
    apk: "Android uygulamasını indir (APK)",
    apkNote: "Ekran kapalıyken de yolculuk kaydı için. Kurulumda 'bilinmeyen kaynaklar' izni istenir.",
  },
  ios: {
    intro: "iPhone ve iPad'de ROVIA, Safari üzerinden ana ekrana eklenir.",
    steps: ["ROVIA'yı Safari'de aç.", "Alttaki Paylaş düğmesine dokun.", "“Ana Ekrana Ekle”yi seç.", "Sağ üstte “Ekle”ye dokun."],
    notSafari: "Bu ekleme yalnızca Safari'de yapılabilir. Bağlantıyı kopyalayıp Safari'de aç.",
  },
  desktop: {
    intro: "ROVIA'yı telefonuna yüklemek için siteyi telefonunun tarayıcısında aç ve oradaki “Uygulamayı yükle” düğmesine dokun.",
    prompt: "Bu bilgisayara yükle",
    more: "Tüm kurulum seçenekleri",
  },
  page: {
    title: "ROVIA'yı indir",
    titleAccent: "yol cebinde.",
    eyebrow: "Telefonunda ROVIA",
    lead: "Ayrı bir mağaza hesabı gerekmez. Android uygulamasını indir ya da ROVIA'yı birkaç dokunuşla ana ekranına ekle.",
    openApp: "Web'de aç",
    cards: {
      apk: {
        title: "Android uygulaması",
        badge: "APK",
        body: "Ekran kapalıyken ve uygulama arka plandayken de GPS yolculuk kaydı sürer. Uzun yolculuklar için önerilen seçenek.",
        cta: "APK'yı indir",
        note: "Kurulumda Android, 'bilinmeyen kaynaklardan yükleme' izni ister; bu izin yalnızca tarayıcın için verilir.",
      },
      androidHome: {
        title: "Android ana ekran",
        badge: "Chrome",
        body: "İndirme gerekmez. ROVIA tam ekran açılır ve her zaman en güncel sürümdür.",
      },
      ios: {
        title: "iPhone / iPad ana ekran",
        badge: "Safari",
        body: "ROVIA'yı Safari'de aç ve ana ekranına ekle; kendi simgesiyle bir uygulama gibi açılır.",
      },
    },
    faqTitle: "Sık sorulanlar",
    faq: [
      {
        q: "APK güvenli mi?",
        a: "APK, ROVIA'nın GitHub deposunda otomatik derleme ile üretilip GitHub Releases'te yayımlanır; yalnızca bu sayfadaki bağlantıdan indir. Uygulama, web sitesiyle aynı hesabı ve aynı güvenlik önlemlerini kullanır; konum yalnızca sen kayıt başlattığında alınır.",
      },
      {
        q: "Güncellemeler nasıl geliyor?",
        a: "Ana ekrana eklenen ROVIA her açılışta en güncel sürümü yükler. Android uygulaması da içeriği doğrudan sunucudan aldığı için çoğu yenilik otomatik gelir; nadiren gereken uygulama güncellemelerinde bu sayfadan yeni APK'yı indirip üzerine kurman yeterli.",
      },
      {
        q: "iPhone'da neden App Store'da yok?",
        a: "ROVIA şimdilik App Store'da yayımlanmıyor. Safari'den ana ekrana eklenen sürüm tam ekran açılır, hesabınla aynı verileri gösterir ve yolculuk kaydını destekler; kayıt sırasında ekranı açık tutman önerilir.",
      },
    ],
  },
  offline: {
    title: "Bağlantı yok",
    body: "İnternet bağlantın kesilmiş görünüyor. Bağlantı geri geldiğinde sayfayı yeniden deneyebilirsin.",
    retry: "Tekrar dene",
    recording: "Süren bir yolculuk kaydın varsa kaydedilen noktalar cihazında saklanır ve bağlantı gelince kayıt ekranı açıldığında otomatik olarak gönderilir.",
  },
} as const;
