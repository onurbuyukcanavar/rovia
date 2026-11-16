import { z } from "zod";

/** Rota seçenekleri (Google Maps'teki "ücretli yollardan / otoyollardan / feribotlardan kaçın"). */
export const routeOptionsSchema = z.object({
  avoidTolls: z.boolean().default(false),
  avoidHighways: z.boolean().default(false),
  avoidFerries: z.boolean().default(false),
});
