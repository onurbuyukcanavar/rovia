import OpenGraphImage from "./opengraph-image";
import { t } from "@/i18n";

export const alt = t.share.page.ogAlt;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage(props: { params: Promise<{ token: string }> }) {
  return OpenGraphImage(props);
}
