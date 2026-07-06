export type ReadStatus = "later" | "reading" | "done";

export interface ArchiveItem {
  id: string;
  url: string;
  author: string;
  authorName?: string;
  previewText: string;
  thumbnail?: string;
  tags: string[];
  status: ReadStatus;
  memo?: string;
  isFavorite: boolean;
  isClassified: boolean;
  savedAt: number;
  statusChangedAt: number;
  lastViewedAt?: number;
}

export interface TagMeta {
  name: string;
  color?: string;
  count: number;
}

export type LibrarySort = "newest" | "oldest" | "favorite";

export interface LibraryFilter {
  status?: ReadStatus | "all";
  tags?: string[];
  favoriteOnly?: boolean;
  sort?: LibrarySort;
}

export interface ArchiveExport {
  app: "rethread";
  version: 2;
  exportedAt: number;
  items: ArchiveItem[];
  tagMeta: TagMeta[];
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
}
