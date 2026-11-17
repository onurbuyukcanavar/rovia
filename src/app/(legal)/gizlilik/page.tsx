import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Gizlilik Politikası ve KVKK Aydınlatma Metni",
  description: "ROVIA’nın kişisel verileri nasıl işlediği, sakladığı ve koruduğu.",
  alternates: { languages: { en: "/privacy" } },
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">{CONTACT_EMAIL}</a>;

export default function PrivacyPageTr() {
  return (
    <LegalPage
      lang="tr"
      title="Gizlilik Politikası ve KVKK Aydınlatma Metni"
      alternate={{ href: "/privacy", label: "English" }}
      intro={
        <p>
          Bu metin, ROVIA yol yolculuğu planlama, GPS kaydı ve seyahat günlüğü uygulamasını (“ROVIA”, rovia-seven.vercel.app)
          kullandığında hangi kişisel verilerinin işlendiğini, neden işlendiğini, kimlerle paylaşıldığını ve haklarını
          6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve uygulanabildiği ölçüde AB Genel Veri Koruma Tüzüğü
          (“GDPR”) çerçevesinde açıklar. ROVIA verilerini satmaz, reklam için kullanmaz ve izleme/analitik çerezi kullanmaz.
        </p>
      }
    >
      <Section title="1. Veri sorumlusu ve iletişim">
        <p>
          Veri sorumlusu ROVIA’nın geliştiricisi Onur Büyükcanavar’dır. Bu metinle ilgili sorular ve başvurular için: <Mail />.
        </p>
      </Section>

      <Section title="2. İşlenen kişisel veriler">
        <ul>
          <li>
            <strong>Hesap bilgileri:</strong> e-posta adresi, ad soyad, profil fotoğrafı bağlantısı, oturum bilgileri. E-posta ile
            kaydolursan şifren yalnızca kimlik doğrulama sağlayıcımızda tek yönlü özet (hash) olarak saklanır; biz göremeyiz.
          </li>
          <li>
            <strong>Google ile giriş:</strong> “Google ile devam et” seçeneğini kullanırsan Google’dan yalnızca temel kimlik bilgilerin
            alınır: ad, e-posta adresi ve profil fotoğrafı (openid, email, profile). Gmail, Drive, Google Haritalar listelerin veya
            başka bir Google hizmetindeki verilerine erişim istenmez.
          </li>
          <li><strong>Profil ve ayarlar:</strong> görünen ad, tercih ettiğin GPS saklama süresi gibi ayarlar.</li>
          <li>
            <strong>Yolculuk planları:</strong> başlangıç, varış ve ara duraklar, hesaplanan rota, tarih, açıklama ve rota seçeneklerin
            (ör. ücretli yollardan kaçın).
          </li>
          <li>
            <strong>Konum verisi (GPS):</strong> yalnızca “Yolculuk Kaydı”nı kendin başlattığında ve uygulama açıkken alınır. Arka
            planda ya da kayıt dışında konum toplanmaz. Bağlantı yokken noktalar geçici olarak cihazındaki tarayıcı deposunda
            (IndexedDB) tutulur ve bağlantı gelince gönderilir. “Konumum” düğmesine bastığında konumun yalnızca o an haritada
            göstermek ve aramaya merkez yapmak için kullanılır.
          </li>
          <li>
            <strong>Favoriler ve içe aktarılan yerler:</strong> kaydettiğin yerler, notların ve liste adların. Google Takeout, KML,
            GPX veya CSV dosyaları senin tarayıcında okunur, sunucuya yüklenmez; sunucuya yalnızca aktarmayı seçtiğin yerlerin adı,
            konumu, notu ve kaynak bağlantısı gönderilir. Bir Google Haritalar paylaşım bağlantısı yapıştırırsan sunucumuz bu
            bağlantının yönlendirmesini Google’dan çözerek yerin konumunu bulur.
          </li>
          <li>
            <strong>Fotoğraflar ve günlük notları:</strong> yüklediğin fotoğraflar, açıklamaları, notların, anıların ve ziyaret
            ettiğin yerler. Fotoğraflar yüklenmeden önce cihazında küçültülür ve dosyadaki EXIF bilgileri (GPS konumu, cihaz
            modeli vb.) silinir. Fotoğrafın çekildiği zaman ve konum bilgisi silinmeden önce okunur ve yalnızca senin özel kaydında
            (fotoğrafı arşivde ve haritada doğru yere koymak için) saklanır.
          </li>
          <li><strong>Arama ve rota istekleri:</strong> aradığın yer adları ve rota hesaplanacak noktalar.</li>
          <li>
            <strong>Teknik ve güvenlik verileri:</strong> kötüye kullanımı önlemek için kullanıcı başına istek sayaçları; barındırma
            sağlayıcısının kısa süre tuttuğu sunucu kayıtları (IP adresi, zaman, istenen sayfa, hata bilgisi).
          </li>
        </ul>
      </Section>

      <Section title="3. İşleme amaçları ve hukuki sebepler">
        <ul>
          <li>
            Hesabını oluşturmak, giriş yapmanı sağlamak ve ROVIA’nın özelliklerini (rota planlama, GPS kaydı, favoriler, seyahat
            günlüğü) sunmak — KVKK m. 5/2-c (sözleşmenin kurulması ve ifası).
          </li>
          <li>
            Güvenlik, kötüye kullanımın ve aşırı yüklemenin önlenmesi, hataların giderilmesi — KVKK m. 5/2-f (meşru menfaat).
          </li>
          <li>Yasal yükümlülüklerin yerine getirilmesi ve hakların korunması — KVKK m. 5/2-ç ve 5/2-e.</li>
        </ul>
        <p>
          Konum verisi yalnızca sen kaydı başlattığında ve senin talebinle işlenir. Kişisel verilerin otomatik karar alma, profil
          çıkarma, reklam veya pazarlama amacıyla kullanılmaz.
        </p>
      </Section>

      <Section title="4. Verilerin aktarıldığı hizmet sağlayıcılar">
        <p>ROVIA’yı çalıştırmak için aşağıdaki hizmet sağlayıcılarla, yalnızca gerekli olan veriler paylaşılır:</p>
        <ul>
          <li><strong>Supabase</strong> — veritabanı, kimlik doğrulama ve dosya depolama; sunucular AB’de (Frankfurt, Almanya).</li>
          <li><strong>Vercel</strong> — uygulamanın barındırılması; sunucu işlemleri Frankfurt’ta, statik içerik küresel ağ üzerinden sunulur.</li>
          <li><strong>Google</strong> — yalnızca “Google ile giriş” kullanırsan kimlik doğrulama için.</li>
          <li><strong>OpenFreeMap</strong> — harita görüntüleri; tarayıcın harita karolarını doğrudan bu hizmetten indirir (IP adresin bu hizmete ulaşır).</li>
          <li><strong>FOSSGIS Valhalla</strong> (Almanya) — rota hesaplama; rota noktaları sunucumuzdan gönderilir, hesap bilgin gönderilmez.</li>
          <li><strong>Photon / komoot</strong> (Almanya) — adres araması; aradığın metin sunucumuzdan gönderilir, hesap bilgin gönderilmez.</li>
        </ul>
        <p>
          Bu sağlayıcılardan bazılarının sunucuları veya şirket merkezleri yurt dışındadır. Bu nedenle kişisel verilerin, hizmetin
          sunulabilmesi için KVKK m. 9’da öngörülen şartlara uygun olarak yurt dışına aktarılabilir. Verilerin hiçbir üçüncü
          kişiye satılmaz; yasal zorunluluk dışında başka kimseyle paylaşılmaz.
        </p>
      </Section>

      <Section title="5. Google kullanıcı verileri">
        <p>
          ROVIA’nın Google API’lerinden aldığı bilgilerin kullanımı ve başka bir uygulamaya aktarımı, Sınırlı Kullanım (Limited Use)
          koşulları dahil{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline" rel="noopener noreferrer" target="_blank">
            Google API Hizmetleri Kullanıcı Verileri Politikası
          </a>
          ’na uygundur. Google’dan alınan ad, e-posta ve profil fotoğrafı yalnızca hesabını oluşturmak, seni tanımak ve
          uygulamada adını göstermek için kullanılır; reklam için kullanılmaz, satılmaz, yapay zekâ modeli eğitmek için
          kullanılmaz ve insanlar tarafından okunmaz (güvenlik, yasal zorunluluk veya senin açık talebin hâli hariç).
        </p>
      </Section>

      <Section title="6. Çerezler ve cihazda saklanan veriler">
        <p>
          ROVIA yalnızca oturumunu açık tutmak için zorunlu çerezler kullanır. Reklam, analitik veya izleme çerezi kullanılmaz.
          GPS kaydı sırasında bağlantı kesilirse kayıt noktaları gönderilene kadar cihazındaki tarayıcı deposunda tutulur.
        </p>
      </Section>

      <Section title="7. Saklama süreleri">
        <ul>
          <li>Hesap, plan, favori, fotoğraf ve not verilerin hesabın açık olduğu sürece saklanır; sen sildiğinde silinir.</li>
          <li>
            Ham GPS noktaları Ayarlar’da seçtiğin süre kadar (hiç saklamama, 30, 90, 365 gün veya süresiz) saklanır ve süre dolunca
            otomatik olarak silinir. Yolculuğun özeti (mesafe, süre, sadeleştirilmiş rota) yolculuk silinene kadar kalır.
          </li>
          <li>Kötüye kullanım sayaçları en fazla birkaç gün, sunucu kayıtları barındırma sağlayıcısının süreleri kadar tutulur.</li>
          <li>Hesabın silindiğinde tüm verilerin ve yüklediğin dosyalar silinir; yasal saklama yükümlülükleri saklıdır.</li>
        </ul>
      </Section>

      <Section title="8. Güvenlik">
        <p>
          Tüm bağlantılar HTTPS ile şifrelenir. Veritabanında her kullanıcı yalnızca kendi verisine erişebilir (satır düzeyi
          güvenlik). Fotoğraflar herkese açık olmayan bir depoda tutulur ve yalnızca sana, kısa süreli imzalı bağlantılarla
          gösterilir. Hiçbir sistem tamamen risksiz olmasa da verilerini korumak için makul teknik ve idari önlemler alınır.
        </p>
      </Section>

      <Section title="9. Hakların">
        <p>KVKK m. 11 uyarınca veri sorumlusuna başvurarak şu haklarını kullanabilirsin:</p>
        <ul>
          <li>kişisel verilerinin işlenip işlenmediğini öğrenme ve işlenmişse bilgi talep etme,</li>
          <li>işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme,</li>
          <li>yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,</li>
          <li>eksik veya yanlış işlenmişse düzeltilmesini, KVKK m. 7 şartlarıyla silinmesini veya yok edilmesini isteme ve bu işlemlerin aktarılan üçüncü kişilere bildirilmesini isteme,</li>
          <li>münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhine bir sonuca itiraz etme,</li>
          <li>kanuna aykırı işleme sebebiyle zarara uğraman hâlinde zararın giderilmesini talep etme.</li>
        </ul>
        <p>
          Verilerine erişim ve verilerinin bir kopyasını alma hakkını uygulama içinden de kullanabilirsin:{" "}
          <strong>Ayarlar → Hesap ve veriler → Verilerimi indir</strong> ile hesabına ait tüm kayıtları (profil, yolculuklar,
          GPS kayıtları, favoriler, notlar, seyahatnameler, paylaşımlar ve fotoğraf bilgileri) makinece okunabilir bir JSON
          dosyası olarak hemen indirebilirsin.
        </p>
        <p>
          Başvurunu ayrıca <Mail /> adresine, hesabında kayıtlı e-posta adresinden gönderebilirsin. Başvurular en geç 30 gün içinde
          ücretsiz olarak yanıtlanır. Başvurunun reddedilmesi veya yanıtı yetersiz bulman hâlinde Kişisel Verileri Koruma
          Kurulu’na şikâyette bulunabilirsin.
        </p>
      </Section>

      <Section title="10. Hesabının ve verilerinin silinmesi">
        <p>
          Planlarını, yolculuklarını, favorilerini, fotoğraflarını ve notlarını uygulama içinden istediğin zaman silebilirsin.
          Hesabını tamamen silmek için <strong>Ayarlar → Hesap ve veriler → Hesabımı sil</strong> adımını kullanabilirsin.
          Güvenliğin için son 15 dakika içinde giriş yapmış olman ve onay ifadesini yazman istenir. Silme işleminde önce
          yüklediğin tüm fotoğraflar depodan, ardından hesabın ve ona bağlı tüm veriler (yolculuklar, GPS kayıtları,
          favoriler, notlar, seyahatnameler, paylaşım bağlantıları, ayarlar) kalıcı olarak silinir; paylaşım bağlantıların
          çalışmaz hâle gelir. Bu işlem geri alınamaz; öncesinde verilerini indirmen önerilir.
        </p>
        <p>
          Uygulamaya erişemiyorsan silme talebini <Mail /> adresine, hesabında kayıtlı e-posta adresinden de iletebilirsin.
          Yasal saklama yükümlülükleri saklıdır.
        </p>
      </Section>

      <Section title="11. Çocuklar">
        <p>
          ROVIA 13 yaşından küçük çocuklara yönelik değildir ve bilerek onlardan veri toplamaz. 18 yaşından küçükler ROVIA’yı
          yalnızca veli veya vasilerinin izniyle kullanmalıdır.
        </p>
      </Section>

      <Section title="12. Değişiklikler">
        <p>
          Bu metin güncellenebilir. Önemli değişikliklerde uygulama içinde veya e-posta ile bilgilendirme yapılır. Güncel metin
          her zaman bu sayfadadır. Kullanım koşulları için: <Link href="/kullanim-kosullari" className="underline">Kullanım Koşulları</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
