"use client";
import { useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { registerMedia } from "@/lib/actions/journal";
import { MEDIA_LIMITS, MediaError, processImage, type ProcessedImage } from "./process";
import { t } from "@/i18n";

export type UploadItem = {
  key: string;
  name: string;
  preview: string | null;
  status: "waiting" | "processing" | "uploading" | "saving" | "done" | "error";
  error?: string;
  mediaId?: string;
};

const GROUP = 10;
const PARALLEL = 3;

function errorText(e: unknown) {
  if (e instanceof MediaError) return t.journal.mediaErrors[e.code];
  return t.journal.errors.uploadFailed;
}

/**
 * Fotoğraf yükleme kuyruğu: tarayıcıda küçült → kullanıcının kendi Storage klasörüne yükle
 * (RLS yalnızca {kullanıcı}/ klasörüne izin verir) → 10'luk gruplar hâlinde kaydet.
 * Kayıt başarısız olursa yüklenen dosyalar geri silinir (yetim dosya kalmaz).
 */
export function useUploader({ userId, tripId, onUploaded }: { userId: string; tripId: string | null; onUploaded?: (ids: string[]) => void }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const queue = useRef<{ key: string; file: File }[]>([]);
  const running = useRef(false);

  const patch = (key: string, p: Partial<UploadItem>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  async function uploadOne(key: string, file: File) {
    patch(key, { status: "processing" });
    let img: ProcessedImage;
    try {
      img = await processImage(file);
    } catch (e) {
      patch(key, { status: "error", error: errorText(e) });
      return null;
    }
    patch(key, { status: "uploading", preview: URL.createObjectURL(img.thumb) });
    const id = crypto.randomUUID();
    const path = `${userId}/${id}.${img.ext}`;
    const thumbPath = `${userId}/${id}_t.${img.ext}`;
    const contentType = img.ext === "webp" ? "image/webp" : "image/jpeg";
    const storage = getBrowserClient().storage.from("media");
    const opts = { contentType, upsert: false, cacheControl: "31536000" };
    const [a, b] = await Promise.all([storage.upload(path, img.main, opts), storage.upload(thumbPath, img.thumb, opts)]);
    if (a.error || b.error) {
      await storage.remove([path, thumbPath]).catch(() => {});
      patch(key, { status: "error", error: t.journal.errors.uploadFailed });
      return null;
    }
    patch(key, { status: "saving" });
    return { key, path, thumbPath, width: img.width, height: img.height, takenAt: img.takenAt, lat: img.lat, lng: img.lng };
  }

  async function run() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      while (queue.current.length) {
        const group = queue.current.splice(0, GROUP);
        const done: NonNullable<Awaited<ReturnType<typeof uploadOne>>>[] = [];
        for (let i = 0; i < group.length; i += PARALLEL) {
          const res = await Promise.all(group.slice(i, i + PARALLEL).map((g) => uploadOne(g.key, g.file)));
          for (const r of res) if (r) done.push(r);
        }
        if (!done.length) continue;
        const r = await registerMedia({
          tripId,
          items: done.map(({ path, thumbPath, width, height, takenAt, lat, lng }) => ({ path, thumbPath, width, height, takenAt, lat, lng })),
        });
        if (!r.ok) {
          await getBrowserClient().storage.from("media").remove(done.flatMap((d) => [d.path, d.thumbPath])).catch(() => {});
          for (const d of done) patch(d.key, { status: "error", error: r.message });
          continue;
        }
        done.forEach((d, i) => patch(d.key, { status: "done", mediaId: r.ids[i] }));
        onUploaded?.(r.ids);
      }
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function add(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MEDIA_LIMITS.perBatch);
    const added = list.map((file) => ({ key: crypto.randomUUID(), file }));
    setItems((cur) => [...cur.filter((x) => x.status !== "done"), ...added.map((a) => ({ key: a.key, name: a.file.name, preview: null, status: "waiting" as const }))]);
    queue.current.push(...added);
    void run();
    return Array.from(files).length - list.length;
  }

  function clear() {
    setItems((cur) => {
      for (const it of cur) if (it.preview) URL.revokeObjectURL(it.preview);
      return cur.filter((x) => x.status !== "done" && x.status !== "error");
    });
  }

  return { items, busy, add, clear };
}
