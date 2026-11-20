import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { hasCredentials, login, users } from "./helpers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** Alice'in bu testte Keşfet'ten eklediği OSM kaydını siler (önceden kayıtlı değilse). */
async function aliceClient() {
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword(users.alice);
  return error ? null : sb;
}

test.describe("Keşfet (PHASE 8)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");

  let addedRef: string | null = null;
  test.afterEach(async () => {
    if (!addedRef) return;
    const sb = await aliceClient();
    await sb?.from("saved_places").delete().eq("osm_ref", addedRef).eq("source", "explore");
    addedRef = null;
  });

  test("Kapadokya'da kaleler: liste, kaynak bağlantısı ve favorilere ekleme", async ({ page }) => {
    await login(page, "alice");
    await page.goto("/kesfet?konum=38.64,34.83,11&kategori=castle");

    // Öne çıkanlar varsayılan; URL'deki kategori seçili gelir
    const chips = page.getByTestId("explore-categories");
    await expect(chips.getByRole("radio", { name: "Kaleler" })).toBeChecked();
    await chips.getByText("Öne çıkanlar").click();
    await expect(chips.getByRole("radio", { name: "Öne çıkanlar" })).toBeChecked();
    await chips.getByText("Kaleler").click();

    const list = page.getByTestId("explore-list");
    const item = list.getByRole("button", { name: /Uçhisar/ }).first();
    await expect(item).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("explore-marker").first()).toBeAttached();

    await item.click();
    const panel = page.getByTestId("explore-place");
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("Uçhisar");
    // Tripadvisor yalnızca dış arama bağlantısı (sabit alan adı, puan yok)
    await expect(panel.getByTestId("tripadvisor-link")).toHaveAttribute("href", /^https:\/\/www\.tripadvisor\.com\.tr\/Search\?q=U%C3%A7hisar/);
    const source = panel.getByTestId("explore-source");
    await expect(source).toContainText("OpenStreetMap katkıcıları (ODbL)");
    const osm = source.getByTestId("explore-osm-link");
    await expect(osm).toHaveAttribute("href", /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    const href = (await osm.getAttribute("href"))!;
    const [, type, id] = href.match(/\/(node|way|relation)\/(\d+)$/)!;
    const ref = `${type[0]}${id}`;

    // Önceden kayıtlıysa test kaydı silmesin
    const sb = await aliceClient();
    const before = sb ? await sb.from("saved_places").select("id").eq("osm_ref", ref).maybeSingle() : null;

    const fav = panel.getByTestId("favorite-actions");
    if (!before?.data) {
      await fav.getByRole("button", { name: "Favorilere ekle" }).click();
      addedRef = ref;
    }
    await expect(fav).toContainText("Kayıtlı");

    // Planlayıcıya bağlantılar yer bilgisini taşır
    const addTrip = panel.getByTestId("explore-add-trip");
    await expect(addTrip.getByRole("link").last()).toHaveAttribute("href", new RegExp(`^/planla\\?yer=${ref}&`));

    await panel.getByRole("button", { name: "Listeye dön" }).click();
    await expect(list).toBeVisible();
  });

  test("çok geniş alanda yakınlaştırma ipucu", async ({ page }) => {
    await login(page, "alice");
    await page.goto("/kesfet?konum=39,35,5&kategori=lake");
    await expect(page.getByText("Alan çok geniş.")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Vikipedi bilgisi (gerçek Wikimedia)", () => {
  test.skip(!hasCredentials, "E2E_* secret'ları tanımlı değil");
  test("Efes için Türkçe özet, kaynak bağlantısı ve görsel döner", async ({ page, baseURL }) => {
    await login(page, "alice");
    const res = await page.request.post("/api/maps/wiki", {
      headers: { origin: new URL(baseURL!).origin, "content-type": "application/json" },
      data: { wikipedia: "tr:Efes" },
    });
    expect(res.status()).toBe(200);
    const { info } = await res.json();
    expect(info, "Vikipedi yanıtı boş").toBeTruthy();
    expect(info.lang).toBe("tr");
    expect(info.extract.length).toBeGreaterThan(80);
    expect(info.url).toMatch(/^https:\/\/tr\.wikipedia\.org\//);
    if (info.thumbnail) expect(info.thumbnail.src).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
  });
});
