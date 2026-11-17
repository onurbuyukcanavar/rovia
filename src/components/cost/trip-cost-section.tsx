import { Wallet } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { tollsForSavedTrip } from "@/lib/cost/tolls";
import { getFuelPrices, getTripCostContext, listVehicles } from "@/lib/queries/vehicles";
import { TripCostCard } from "./trip-cost-card";
import { t } from "@/i18n";

/**
 * Yolculuk sayfasındaki maliyet kartı. Tamamlanan yolculukta kaydedilen mesafe, yoksa planlanan rota mesafesi
 * kullanılır; mesafe hiç yoksa kart gösterilmez. Kayıtlı yolculuklarda rota adımları saklanmadığından geçişler
 * durak adlarından ve kayıtlı bayraklardan çıkarılır; kullanıcı kalem ekleyip düzenleyebilir.
 */
export async function TripCostSection({ tripId, recordedM }: { tripId: string; recordedM: number | null }) {
  const user = await requireUser();
  const [ctx, vehicles, fuelPrices] = await Promise.all([getTripCostContext(tripId), listVehicles(), getFuelPrices(user.id)]);
  if (!ctx) return null;
  const recorded = recordedM !== null && recordedM > 0 ? recordedM : null;
  const distanceM = recorded ?? ctx.plannedDistanceM;
  if (!distanceM) return null;
  const tolls = tollsForSavedTrip({ names: ctx.stopNames, hasToll: ctx.hasToll, hasFerry: ctx.hasFerry });
  return (
    <section className="card space-y-3 p-4" aria-labelledby="trip-cost-title" data-testid="trip-cost-section">
      <h2 id="trip-cost-title" className="flex items-center gap-2 font-bold"><Wallet className="size-5 text-amber-600" aria-hidden /> {t.garage.cost.title}</h2>
      <TripCostCard tripId={tripId} distanceM={distanceM} distanceSource={recorded ? "recorded" : "planned"}
        vehicles={vehicles} fuelPrices={fuelPrices} tolls={tolls} initial={ctx.assumptions} />
    </section>
  );
}
