/** OSM alt türlerinin (geo_features.subtype) Türkçe karşılıkları. */
const LABELS: Record<string, string> = {
  fuel: "Akaryakıt istasyonu", charging_station: "Şarj istasyonu", rest_area: "Dinlenme alanı", services: "Dinlenme tesisi",
  restaurant: "Restoran", fast_food: "Hızlı yemek", food_court: "Yemek alanı", cafe: "Kafe",
  hospital: "Hastane", pharmacy: "Eczane", clinic: "Sağlık merkezi",
  hotel: "Otel", motel: "Motel", guest_house: "Pansiyon", hostel: "Hostel",
  camp_site: "Kamp alanı", caravan_site: "Karavan alanı", museum: "Müze",
  castle: "Kale", ruins: "Harabe", archaeological_site: "Ören yeri", monument: "Anıt", fort: "Hisar",
  city_gate: "Şehir kapısı", aqueduct: "Su kemeri", tomb: "Türbe", caravanserai: "Kervansaray",
  citywalls: "Sur", bridge: "Tarihî köprü", church: "Tarihî kilise", mosque: "Tarihî cami",
  peak: "Zirve", waterfall: "Şelale", cave_entrance: "Mağara", beach: "Plaj", spring: "Kaynak", volcano: "Volkan",
  gorge: "Boğaz / Kanyon", canyon: "Kanyon", viewpoint: "Seyir noktası", nature_reserve: "Tabiat koruma alanı",
  national_park: "Millî park", lake: "Göl",
  attraction: "Gezilecek yer", theme_park: "Tema parkı", zoo: "Hayvanat bahçesi", aquarium: "Akvaryum", gallery: "Galeri",
  mall: "Alışveriş merkezi", department_store: "Mağaza", supermarket: "Market", marketplace: "Pazar yeri",
  muslim: "Cami", christian: "Kilise", jewish: "Sinagog",
  city: "Şehir", town: "İlçe / Kasaba", village: "Köy", suburb: "Mahalle",
};

export const subtypeLabel = (subtype: string | null | undefined): string | null =>
  subtype ? (LABELS[subtype] ?? null) : null;
