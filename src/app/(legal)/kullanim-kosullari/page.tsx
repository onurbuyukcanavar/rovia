import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LegalPage, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description: "ROVIA’nın kullanım koşulları.",
  alternates: { languages: { en: "/terms" } },
};

const Mail = () => <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">{CONTACT_EMAIL}</a>;

export default function TermsPageTr() {
  return (
    <LegalPage
      lang="tr"
      title="Kullanım Koşulları"
      alternate={{ href: "/terms", label: "English" }}
      intro={
        <p>
          Bu koşullar, ROVIA web uygulamasını (rovia-seven.vercel.app) kullanımını düzenler. Hesap oluşturarak veya ROVIA’yı
          kullanarak bu koşulları kabul etmiş olursun. Kişisel verilerinin nasıl işlendiği{" "}
          <Link href="/gizlilik" className="underline">Gizlilik Politikası ve KVKK Aydınlatma Metni</Link>’nde açıklanır.
        </p>
      }
    >
      <Section title="1. Hizmet">
        <p>
          ROVIA; yol yolculuğu planlama, rota üzerindeki yerleri keşfetme, yolculuğu GPS ile kaydetme, favori yerleri saklama ve
          seyahat günlüğü tutma imkânı sunan bir web uygulamasıdır. Hizmet şu anda ücretsizdir ve geliştirilmeye devam
          etmektedir; özellikler değişebilir, eklenebilir veya kaldırılabilir. Hizmet Onur Büyükcanavar tarafından sunulur.
        </p>
      </Section>

      <Section title="2. Hesap">
        <ul>
          <li>Kayıt sırasında doğru bilgi vermeli ve hesabının güvenliğini (şifren, cihazın) korumalısın.</li>
          <li>Hesabında gerçekleşen işlemlerden sen sorumlusun; yetkisiz kullanım fark edersen bize hemen bildir.</li>
          <li>13 yaşından küçükler ROVIA’yı kullanamaz; 18 yaşından küçükler yalnızca veli veya vasilerinin izniyle kullanabilir.</li>
        </ul>
      </Section>

      <Section title="3. Kabul edilebilir kullanım">
        <p>ROVIA’yı kullanırken şunları yapmamayı kabul edersin:</p>
        <ul>
          <li>hukuka aykırı, başkalarının haklarını ihlal eden, hakaret içeren veya zararlı içerik yüklemek,</li>
          <li>başkasının kişisel verilerini veya fotoğraflarını izinsiz yüklemek, başkalarını izinsiz takip etmek,</li>
          <li>hizmetin güvenliğini aşmaya, başka kullanıcıların verilerine erişmeye veya hizmeti aksatmaya çalışmak,</li>
          <li>otomatik araçlarla hizmete veya harita/rota servislerine aşırı istek göndermek, verileri toplu olarak çekmek.</li>
        </ul>
      </Section>

      <Section title="4. İçeriğin">
        <p>
          Yüklediğin fotoğraflar, notlar ve diğer içeriklerin sahibi sensin. ROVIA’ya, bu içerikleri yalnızca hizmeti sana
          sunmak için saklama, işleme ve sana gösterme konusunda sınırlı, devredilemez bir izin vermiş olursun. İçeriklerin
          herkese açık yapılmaz; ileride eklenecek paylaşım özellikleri yalnızca sen seçtiğinde içeriklerini başkalarına
          gösterir. İçeriklerini istediğin zaman silebilirsin.
        </p>
      </Section>

      <Section title="5. Harita, rota ve konum bilgisi">
        <ul>
          <li>
            Harita verisi © OpenStreetMap katkıda bulunanlar (ODbL lisansı); rota hesaplama Valhalla, harita görüntüleri
            OpenFreeMap ile sağlanır.
          </li>
          <li>
            Rotalar, mesafeler, süreler, ücretli yol ve feribot bilgileri, yol tarifleri ve önerilen yerler bilgilendirme
            amaçlıdır; eksik, güncel olmayan veya hatalı olabilir. Trafik durumu hesaba katılmaz.
          </li>
          <li>
            Yoldaki işaretlere, trafik kurallarına ve yetkililerin talimatlarına her zaman öncelik ver. Araç kullanırken
            uygulamayı elle kullanma; kaydı yolculuktan önce başlat.
          </li>
          <li>Köprü, otoyol ve feribot ücretleri ile sefer saatleri için ilgili işletmecinin güncel bilgisini esas al.</li>
        </ul>
      </Section>

      <Section title="6. Üçüncü taraf hizmetler">
        <p>
          ROVIA; Google ile giriş, harita, rota ve adres araması için üçüncü taraf hizmetlerden yararlanır. Bu hizmetlerin
          kesintilerinden veya kendi koşullarından ROVIA sorumlu değildir. Google ile giriş yaptığında Google’ın koşulları da
          geçerlidir.
        </p>
      </Section>

      <Section title="7. Hizmetin sürekliliği">
        <p>
          ROVIA’yı kesintisiz ve hatasız sunmak için çaba gösterilir ancak bu garanti edilmez. Bakım, güvenlik veya teknik
          nedenlerle hizmet geçici olarak durdurulabilir. Hizmetin sona erdirilmesi hâlinde verilerini dışa aktarabilmen için
          makul süre öncesinden bildirim yapılır.
        </p>
      </Section>

      <Section title="8. Sorumluluğun sınırlandırılması">
        <p>
          Hizmet “olduğu gibi” sunulur. Mevzuatın izin verdiği ölçüde ROVIA; rota, süre, ücret veya yer bilgilerine dayanılarak
          alınan kararlardan, yolculuk sırasında oluşabilecek kayıp ve zararlardan, üçüncü taraf hizmetlerin kesintilerinden ve
          dolaylı zararlardan sorumlu tutulamaz. Kast veya ağır ihmalden doğan sorumluluk ile tüketici mevzuatından doğan
          vazgeçilemez hakların saklıdır.
        </p>
      </Section>

      <Section title="9. Hesabın sona ermesi">
        <p>
          Hesabını istediğin zaman Ayarlar → Hesap ve veriler bölümünden kalıcı olarak silebilir, öncesinde verilerini
          indirebilirsin; dilersen <Mail /> adresine yazarak da talepte bulunabilirsin. Bu koşulları ciddi
          biçimde veya tekrar tekrar ihlal eden hesaplar, mümkünse önceden bildirilerek askıya alınabilir veya kapatılabilir.
        </p>
      </Section>

      <Section title="10. Değişiklikler">
        <p>
          Bu koşullar güncellenebilir. Önemli değişikliklerde uygulama içinde veya e-posta ile bilgilendirme yapılır;
          değişiklikten sonra hizmeti kullanmaya devam etmen güncel koşulları kabul ettiğin anlamına gelir.
        </p>
      </Section>

      <Section title="11. Uygulanacak hukuk ve uyuşmazlıklar">
        <p>
          Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda İstanbul (Çağlayan) mahkemeleri ve icra daireleri
          yetkilidir; tüketici sıfatıyla sahip olduğun tüketici hakem heyetlerine ve tüketici mahkemelerine başvurma hakkın
          saklıdır.
        </p>
      </Section>

      <Section title="12. İletişim">
        <p>Sorular ve bildirimler için: <Mail />.</p>
      </Section>
    </LegalPage>
  );
}
