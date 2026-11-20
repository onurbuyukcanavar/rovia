import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Statik dosyalar, görseller ve PWA dosyaları hariç tüm istekler
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|fonts/|\\.well-known/|google[0-9a-f]+\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
