"use client";
import { createContext, useContext } from "react";
import type { MediaItem } from "@/lib/journal/types";

export type EditorMedia = {
  byId: Map<string, MediaItem>;
  /** Yeni yüklenen, medya listesi yenilenene dek henüz bilinmeyen kimlikler */
  waiting: ReadonlySet<string>;
};

export const EditorMediaContext = createContext<EditorMedia>({ byId: new Map(), waiting: new Set() });

export function useEditorMedia() {
  return useContext(EditorMediaContext);
}
