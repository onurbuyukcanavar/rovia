import { t } from "@/i18n";

export type GeoErrorCode =
  | "unauthorized" | "forbidden" | "payload_too_large" | "rate_limited" | "invalid_request" | "busy"
  | "not_found" | "zero_results" | "no_suitable_route" | "timeout" | "upstream";

const STATUS: Record<GeoErrorCode, number> = {
  unauthorized: 401, forbidden: 403, payload_too_large: 413, rate_limited: 429, invalid_request: 400, busy: 503,
  not_found: 404, zero_results: 404, no_suitable_route: 404, timeout: 504, upstream: 502,
};

/** Kullanıcıya gösterilebilir, iç ayrıntı sızdırmayan hata. Ham ayrıntı yalnızca sunucu loguna gider. */
export class GeoError extends Error {
  readonly code: GeoErrorCode;
  readonly status: number;
  constructor(code: GeoErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "GeoError";
    this.code = code;
    this.status = STATUS[code];
  }
  get userMessage(): string {
    return t.maps.errors[this.code];
  }
}
