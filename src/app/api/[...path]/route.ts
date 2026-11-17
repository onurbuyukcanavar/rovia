import { t } from "@/i18n";

/**
 * Tanımsız /api/* adresleri: HTML 404 sayfası yerine JSON 404 (istemci kodu hatayı ayrıştırabilsin).
 * Daha belirgin (statik) API yolları her zaman bu yakalayıcıdan önce eşleşir.
 */
function notFound(): Response {
  return Response.json(
    { error: { code: "not_found", message: t.common.apiNotFound } },
    { status: 404, headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
