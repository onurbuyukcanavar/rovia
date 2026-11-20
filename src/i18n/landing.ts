/** Herkese açık ana sayfa (/) metinleri. */
export const landing = {
  hero: {
    titleLead: "Yolun kendisi",
    titleAccent: "bir hikâye.",
    body: "Rotanı planla, yol üstündeki güzellikleri keşfet, yolculuğunu kaydet. Eve döndüğünde hepsi bir seyahatnameye dönüşsün.",
    scroll: "Kaydır",
  },
  stats: [
    { value: "Rota boyunca", label: "keşif önerileri" },
    { value: "Kilometre kilometre", label: "GPS kaydı" },
    { value: "Kitap gibi", label: "PDF seyahatname" },
    { value: "Tamamen", label: "ücretsiz" },
  ],
  statsLabel: "ROVIA'da neler var",
  chapters: [
    {
      key: "discover",
      index: "01",
      eyebrow: "Keşfet",
      title: "Haritaya değil, yola bak.",
      body: "İstanbul'dan Fethiye'ye, ROVIA rotanın üzerindeki tarihî yapıları, doğa güzelliklerini ve iyi bir kahve molasını yolun kendisine göre bulur.",
      tags: ["Rota üzerinde keşif", "Duraklar", "Favoriler"],
    },
    {
      key: "journey",
      index: "02",
      eyebrow: "Yolculuk et",
      title: "Her kilometre kendi izini bırakır.",
      body: "Kaydı başlat, yola odaklan. ROVIA yolculuğunu GPS ile kaydeder; bağlantı kopsa bile noktalar cihazında bekler, iz kaybolmaz.",
      tags: ["GPS kaydı", "Mesafe ve süre", "Çevrimdışı güvence"],
    },
    {
      key: "remember",
      index: "03",
      eyebrow: "Hatırla",
      title: "Yol biter, hikâye kalır.",
      body: "Fotoğrafların, notların ve keşiflerin bölüm bölüm bir seyahatnameye dönüşür. İstersen bağlantıyla paylaş, istersen kitap gibi PDF olarak sakla.",
      tags: ["Seyahat günlüğü", "Paylaşım bağlantısı", "PDF"],
    },
  ],
  odometer: { unit: "km", route: "İstanbul → Fethiye", srLabel: "Örnek yolculuk: İstanbul'dan Fethiye'ye yaklaşık 830 kilometre." },
  companion: {
    eyebrow: "Yol arkadaşın",
    title: "Yaşayan bir yol arkadaşı",
    body: "Planlarken, sürerken ve dönünce aynı yerde: ROVIA yolculuğunun her anına eşlik eder.",
    features: [
      { title: "Planla", body: "Başlangıcı, varışı ve durakları seç; rotan ve yol üstündeki öneriler hazır." },
      { title: "Kaydet", body: "Kaydı sen başlatırsın; mesafe, süre ve iz kendiliğinden birikir." },
      { title: "Anlat", body: "Günlük notlarını seyahatnameye dönüştür, paylaş ya da PDF olarak indir." },
    ],
    mock: {
      greeting: "Bugün yol nereye?",
      from: "İstanbul",
      to: "Fethiye",
      meta: "830 km · 3 durak",
      stops: ["Bursa", "İzmir", "Muğla"],
      start: "Yolculuğu başlat",
      nav: ["Panel", "Harita", "Yolculuklar", "Kayıt", "Diğer"],
    },
  },
  faq: {
    eyebrow: "Sık sorulanlar",
    title: "Yola çıkmadan önce",
    items: [
      {
        q: "ROVIA ücretsiz mi?",
        a: "Evet. ROVIA şu anda tamamen ücretsiz; rota planlama, keşif, yolculuk kaydı ve seyahatname özelliklerinin hepsini bir hesapla kullanabilirsin.",
      },
      {
        q: "Konumum ne zaman alınıyor?",
        a: "Konumun yalnızca yolculuk kaydını sen başlattığında alınır ve yalnızca senin hesabında saklanır. Kayıt dışında konum toplanmaz, reklam ya da profilleme için kullanılmaz.",
      },
      {
        q: "Android uygulaması var mı?",
        a: "Var. İndirme sayfasından Android uygulamasını (APK) kurabilirsin; ekran kapalıyken de yolculuk kaydı sürer. İstersen ROVIA'yı Chrome'dan ana ekrana da ekleyebilirsin.",
      },
      {
        q: "iPhone'da kullanabilir miyim?",
        a: "Evet. ROVIA'yı Safari'de açıp “Ana Ekrana Ekle” ile yükleyebilirsin; kendi simgesiyle tam ekran açılır. Kayıt sırasında ekranı açık tutman önerilir.",
      },
      {
        q: "Seyahatnamemi PDF olarak alabilir miyim?",
        a: "Evet. Seyahatnameni fotoğrafları ve notlarıyla birlikte kitap düzeninde PDF olarak indirebilir ya da bir bağlantıyla paylaşabilirsin.",
      },
    ],
  },
  final: {
    title: "Yola çık.",
    body: "Bir sonraki yolculuğun, anlatmaya değer bir hikâyenin ilk sayfası olsun.",
  },
} as const;
