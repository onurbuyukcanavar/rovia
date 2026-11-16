import { t } from "@/i18n";

export type MapsErrorCode =
  | "not_configured" | "unauthorized" | "rate_limited" | "invalid_request"
  | "denied" | "quota" | "not_found" | "zero_results" | "timeout" | "upstream";

const STATUS: Record<MapsErrorCode, number> = {
  not_configured: 503, unauthorized: 401, rate_limited: 429, invalid_request: 400,
  denied: 502, quota: 503, not_found: 404, zero_results: 404, timeout: 504, upstream: 502,
};

/** Kullanıcıya gösterilebilir, iç ayrıntı sızdırmayan hata. */
export class MapsError extends Error {
  readonly code: MapsErrorCode;
  readonly status: number;
  constructor(code: MapsErrorCode, detail?: string) {
    super(detail ?? code);
    this.name = "MapsError";
    this.code = code;
    this.status = STATUS[code];
  }
  get userMessage(): string {
    return t.maps.errors[this.code];
  }
}

/**
 * Google API hata gövdesini (google.rpc.Status) veya HTTP durumunu MapsError'a çevirir.
 * Google'ın ham mesajı yalnızca sunucu loguna yazılır.
 */
export function fromGoogleError(httpStatus: number, body: unknown): MapsError {
  const status = (body as { error?: { status?: string; message?: string } })?.error?.status;
  const message = (body as { error?: { message?: string } })?.error?.message;
  const detail = `google ${httpStatus} ${status ?? ""} ${message ?? ""}`.trim();
  if (status === "RESOURCE_EXHAUSTED" || httpStatus === 429) return new MapsError("quota", detail);
  if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED" || httpStatus === 403 || httpStatus === 401)
    return new MapsError("denied", detail);
  if (status === "NOT_FOUND" || httpStatus === 404) return new MapsError("not_found", detail);
  if (status === "INVALID_ARGUMENT" || httpStatus === 400) return new MapsError("invalid_request", detail);
  return new MapsError("upstream", detail);
}

/** Geocoding API (JSON) 200 ile döner; durum `status` alanındadır. */
export function fromGeocodingStatus(status: string, errorMessage?: string): MapsError | null {
  switch (status) {
    case "OK": return null;
    case "ZERO_RESULTS": return new MapsError("zero_results", status);
    case "OVER_DAILY_LIMIT":
    case "OVER_QUERY_LIMIT": return new MapsError("quota", `${status} ${errorMessage ?? ""}`);
    case "REQUEST_DENIED": return new MapsError("denied", `${status} ${errorMessage ?? ""}`);
    case "INVALID_REQUEST": return new MapsError("invalid_request", status);
    default: return new MapsError("upstream", `${status} ${errorMessage ?? ""}`);
  }
}
