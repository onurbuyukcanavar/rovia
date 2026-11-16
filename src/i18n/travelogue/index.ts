import { editor } from "./editor";
import { book } from "./book";
import { pages } from "./pages";

/** ROVIA Journal (seyahatname) metinleri. Her alt dosya ayrı bir modülün metinlerini taşır. */
export const travelogue = {
  errors: {
    invalid: "Bilgiler geçersiz. Lütfen kontrol edip tekrar dene.",
    notFound: "Seyahatname veya yazı bulunamadı. Silinmiş olabilir.",
    titleRequired: "Başlık boş bırakılamaz.",
    tooMany: "Bu seyahatnamede çok fazla öğe var.",
    invalidLocation: "Konum eksik veya geçersiz.",
    tooLarge: "Metin çok uzun. Yazıyı birkaç yazıya bölmeyi dene.",
    rateLimited: "Çok sık kaydediliyor. Birkaç saniye sonra tekrar denenecek.",
    conflict: "Bu içerik başka bir sekmede veya cihazda değiştirildi.",
    staleOrder: "Liste bu arada değişti. Sayfayı yenileyip tekrar dene.",
  },
  editor,
  book,
  pages,
} as const;
