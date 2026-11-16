import { z } from "zod";
import { decodePolyline } from "@/lib/geo";
import { t } from "@/i18n";

const int = (max: number) => z.number().int().min(0).max(max);

export const tripStopSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullable().transform((v) => v || null),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  ref: z.string().regex(/^[nwr][0-9]{1,19}$/).nullable(),
});

export const tripRouteSchema = z.object({
  encodedPolyline: z
    .string()
    .min(2)
    .max(400_000)
    .refine((p) => {
      try {
        return decodePolyline(p).length >= 2;
      } catch {
        return false;
      }
    }),
  distanceMeters: int(10_000_000),
  durationSeconds: int(10_000_000),
  legs: z.array(z.object({ distanceMeters: int(10_000_000), durationSeconds: int(10_000_000) })).min(1).max(19),
  hasToll: z.boolean(),
  hasFerry: z.boolean(),
});

/** YYYY-MM-DD; gerçek bir takvim günü ve 2000–2100 arası (veritabanı kısıtıyla aynı). */
const plannedDate = z
  .string()
  .nullable()
  .transform((v) => v || null)
  .refine((v) => {
    if (v === null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v >= "2000-01-01" && v <= "2100-12-31";
  }, { error: t.trips.errors.date });

export const tripPlanSchema = z
  .object({
    id: z.uuid().nullable(),
    version: z.number().int().min(1).nullable(),
    title: z.string().trim().min(1, { error: t.trips.errors.title }).max(160, { error: t.trips.errors.titleMax }),
    description: z
      .string()
      .trim()
      .max(5000, { error: t.trips.errors.descriptionMax })
      .nullable()
      .transform((v) => v || null),
    plannedDate,
    stops: z.array(tripStopSchema).min(2).max(20),
    route: tripRouteSchema.nullable(),
  })
  .refine((d) => (d.id === null) === (d.version === null), { path: ["version"] })
  // Rota başka duraklar için hesaplanmışsa kaydedilmez
  .refine((d) => d.route === null || d.route.legs.length === d.stops.length - 1, { path: ["route"] });

export type TripPlanInput = z.input<typeof tripPlanSchema>;
export type TripPlan = z.output<typeof tripPlanSchema>;
