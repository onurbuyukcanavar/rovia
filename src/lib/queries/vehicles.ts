import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isFuelType, type CostAssumptions, type FuelPrices, type Vehicle } from "@/lib/cost/types";
import { readAssumptions, readFuelPrices } from "@/lib/cost/schema";

const COLUMNS = "id, name, make, model, model_year, fuel_type, consumption_per_100km, tank_capacity, is_default";

type Row = {
  id: string; name: string; make: string | null; model: string | null; model_year: number | null; fuel_type: string;
  consumption_per_100km: number | string | null; tank_capacity: number | string | null; is_default: boolean;
};

const num = (v: number | string | null) => (v === null ? null : Number(v));

export function toVehicle(r: Row): Vehicle {
  return {
    id: r.id, name: r.name, make: r.make, model: r.model, modelYear: r.model_year,
    fuelType: isFuelType(r.fuel_type) ? r.fuel_type : "other",
    consumption: num(r.consumption_per_100km), tankCapacity: num(r.tank_capacity), isDefault: r.is_default,
  };
}

/** Kullanıcının araçları (varsayılan önce, sonra eklenme sırası). */
export async function listVehicles(): Promise<Vehicle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vehicles").select(COLUMNS)
    .order("is_default", { ascending: false }).order("created_at", { ascending: true }).limit(50);
  if (error) throw new Error(`VEHICLES_QUERY_FAILED: ${error.message}`);
  return (data ?? []).map(toVehicle);
}

/** user_settings.cost_defaults içindeki hatırlanan yakıt fiyatları. */
export async function getFuelPrices(userId: string): Promise<FuelPrices> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("user_settings").select("cost_defaults").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`COST_DEFAULTS_QUERY_FAILED: ${error.message}`);
  return readFuelPrices(data?.cost_defaults ?? null);
}

export type TripCostContext = {
  plannedDistanceM: number | null;
  vehicleId: string | null;
  assumptions: CostAssumptions | null;
  hasToll: boolean;
  hasFerry: boolean;
  stopNames: string[];
};

/** Yolculuk sayfasındaki maliyet kartı için: kayıtlı rota özeti, varsayımlar ve durak adları. */
export async function getTripCostContext(tripId: string): Promise<TripCostContext | null> {
  if (!z.uuid().safeParse(tripId).success) return null;
  const supabase = await createClient();
  const [{ data: trip, error }, { data: stops }] = await Promise.all([
    supabase.from("trips").select("route_distance_m, route_has_toll, route_has_ferry, vehicle_id, cost_assumptions").eq("id", tripId).maybeSingle(),
    supabase.from("trip_stops").select("name, address").eq("trip_id", tripId).order("stop_order").limit(25),
  ]);
  if (error) throw new Error(`TRIP_COST_QUERY_FAILED: ${error.message}`);
  if (!trip) return null;
  return {
    plannedDistanceM: trip.route_distance_m,
    vehicleId: trip.vehicle_id,
    assumptions: readAssumptions(trip.cost_assumptions),
    hasToll: trip.route_has_toll,
    hasFerry: trip.route_has_ferry,
    stopNames: (stops ?? []).flatMap((s) => [s.name, s.address ?? ""]).filter(Boolean),
  };
}
