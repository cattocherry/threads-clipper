import { nanoid } from "nanoid";
import { db } from "./db";
import type {
  ArchiveExport,
  ArchiveItem,
  ImportResult,
  LibraryFilter,
  ReadStatus,
  TagMeta
} from "./types";

const STATUS_LABELS: Record<string, ReadStatus> = {
  "나중에 볼 것": "later",
  "읽는 중": "reading",
  "다 봄": "done",
  later: "later",
  reading: "reading",
  done: "done"
};

function uniqueTags(tags: string[]) {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter(Boolean))
  ).slice(0, 12);
}

function sortItems(items: ArchiveItem[], sort: LibraryFilter["sort"] = "newest") {
  const sorted = [...items];
  if (sort === "oldest") {
    return sorted.sort((a, b) => a.savedAt - b.savedAt);
  }
  if (sort === "favorite") {
    return sorted.sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.savedAt - a.savedAt);
  }
  return sorted.sort((a, b) => b.savedAt - a.savedAt);
}

async function refreshTagCounts() {
  const items = await db.items.toArray();
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  await db.transaction("rw", db.tagMeta, async () => {
    await db.tagMeta.clear();
    await db.tagMeta.bulkPut(
      Array.from(counts.entries()).map(([name, count]) => ({ name, count }))
    );
  });
}

export async function addItem(partial: {
  url: string;
  author?: string;
  authorName?: string;
  previewText?: string;
  thumbnail?: string;
}) {
  const now = Date.now();
  const item: ArchiveItem = {
    id: nanoid(),
    url: partial.url,
    author: partial.author ?? "",
    authorName: partial.authorName,
    previewText: partial.previewText ?? "",
    thumbnail: partial.thumbnail,
    tags: [],
    status: "later",
    memo: "",
    isFavorite: false,
    isClassified: false,
    savedAt: now,
    statusChangedAt: now
  };
  await db.items.add(item);
  return item;
}

export async function updateItem(id: string, patch: Partial<Omit<ArchiveItem, "id">>) {
  if (patch.tags) {
    patch.tags = uniqueTags(patch.tags);
  }
  await db.items.update(id, patch);
  if (patch.tags) {
    await refreshTagCounts();
  }
}

export async function deleteItem(id: string) {
  await db.items.delete(id);
  await refreshTagCounts();
}

export async function setStatus(id: string, status: ReadStatus) {
  await db.items.update(id, { status, statusChangedAt: Date.now() });
}

export async function confirmTags(id: string, tags: string[]) {
  await db.items.update(id, {
    tags: uniqueTags(tags),
    isClassified: true
  });
  await refreshTagCounts();
}

export async function getInboxItems() {
  return (await db.items.filter((item) => !item.isClassified).toArray()).sort((a, b) => b.savedAt - a.savedAt);
}

export async function getLibraryItems(filter: LibraryFilter = {}) {
  const status = filter.status === "all" ? undefined : filter.status;
  const selectedTags = filter.tags ?? [];
  let items = await db.items.filter((item) => item.isClassified).toArray();
  if (status) {
    items = items.filter((item) => item.status === status);
  }
  if (filter.favoriteOnly) {
    items = items.filter((item) => item.isFavorite);
  }
  if (selectedTags.length) {
    items = items.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)));
  }
  return sortItems(items, filter.sort);
}

export async function searchItems(query: string) {
  const needle = query.trim().toLowerCase();
  const items = await db.items.filter((item) => item.isClassified).toArray();
  if (!needle) {
    return sortItems(items);
  }
  return sortItems(
    items.filter((item) =>
      [
        item.author,
        item.authorName,
        item.previewText,
        item.memo,
        item.url,
        ...item.tags
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  );
}

export async function getAllTags() {
  const tags = await db.tagMeta.toArray();
  return tags.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function renameTag(oldName: string, newName: string) {
  const clean = newName.trim();
  if (!clean || clean === oldName) return;
  const items = await db.items.filter((item) => item.tags.includes(oldName)).toArray();
  await db.transaction("rw", db.items, async () => {
    await Promise.all(
      items.map((item) =>
        db.items.update(item.id, {
          tags: uniqueTags(item.tags.map((tag) => (tag === oldName ? clean : tag)))
        })
      )
    );
  });
  await refreshTagCounts();
}

export async function deleteTag(name: string) {
  const items = await db.items.filter((item) => item.tags.includes(name)).toArray();
  await db.transaction("rw", db.items, async () => {
    await Promise.all(
      items.map((item) =>
        db.items.update(item.id, {
          tags: item.tags.filter((tag) => tag !== name)
        })
      )
    );
  });
  await refreshTagCounts();
}

export async function exportJSON(): Promise<ArchiveExport> {
  return {
    app: "rethread",
    version: 2,
    exportedAt: Date.now(),
    items: await db.items.toArray(),
    tagMeta: await db.tagMeta.toArray()
  };
}

function normalizeV1Item(raw: unknown): ArchiveItem | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const url = String(source.url ?? source.link ?? "").trim();
  if (!url) return null;
  const savedAt = Number(source.savedAt ?? source.createdAt ?? Date.now());
  const rawStatus = String(source.status ?? "later");
  const isImportant = rawStatus === "중요" || Boolean(source.important);
  return {
    id: String(source.id ?? nanoid()),
    url,
    author: String(source.author ?? source.handle ?? ""),
    authorName: typeof source.authorName === "string" ? source.authorName : undefined,
    previewText: String(source.previewText ?? source.description ?? source.title ?? ""),
    thumbnail: typeof source.thumbnail === "string" ? source.thumbnail : typeof source.image === "string" ? source.image : undefined,
    tags: uniqueTags(Array.isArray(source.tags) ? source.tags.map(String) : []),
    status: isImportant ? "later" : STATUS_LABELS[rawStatus] ?? "later",
    memo: String(source.memo ?? source.note ?? ""),
    isFavorite: Boolean(source.isFavorite ?? isImportant),
    isClassified: Boolean(source.isClassified ?? true),
    savedAt,
    statusChangedAt: Number(source.statusChangedAt ?? savedAt),
    lastViewedAt: typeof source.lastViewedAt === "number" ? source.lastViewedAt : undefined
  };
}

function normalizeImport(data: unknown): { items: ArchiveItem[]; tagMeta: TagMeta[] } {
  if (data && typeof data === "object" && (data as ArchiveExport).app === "rethread") {
    const archive = data as ArchiveExport;
    return {
      items: (archive.items ?? []).map(normalizeV1Item).filter(Boolean) as ArchiveItem[],
      tagMeta: archive.tagMeta ?? []
    };
  }
  const maybeItems = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? ((data as Record<string, unknown>).clips as unknown[]) ?? ((data as Record<string, unknown>).items as unknown[]) ?? []
      : [];
  return {
    items: maybeItems.map(normalizeV1Item).filter(Boolean) as ArchiveItem[],
    tagMeta: []
  };
}

export async function importJSON(data: unknown, mode: "merge" | "overwrite"): Promise<ImportResult> {
  const normalized = normalizeImport(data);
  let added = 0;
  let updated = 0;
  let skipped = 0;

  await db.transaction("rw", db.items, db.tagMeta, async () => {
    if (mode === "overwrite") {
      await db.items.clear();
      await db.tagMeta.clear();
    }
    for (const item of normalized.items) {
      const exists = await db.items.get(item.id);
      if (exists && mode === "merge") {
        skipped += 1;
        continue;
      }
      await db.items.put(item);
      exists ? (updated += 1) : (added += 1);
    }
    if (normalized.tagMeta.length && mode === "overwrite") {
      await db.tagMeta.bulkPut(normalized.tagMeta);
    }
  });
  await refreshTagCounts();
  return { added, updated, skipped };
}

export async function getStaleReadingItems(days = 7) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (await db.items.where("status").equals("reading").toArray())
    .filter((item) => item.statusChangedAt <= cutoff)
    .sort((a, b) => a.statusChangedAt - b.statusChangedAt);
}

export async function getRediscoveryItems(n: number) {
  const candidates = (await db.items.filter((item) => item.isClassified).toArray()).filter(
    (item) => item.status === "later" || item.status === "done"
  );
  const now = Date.now();
  return candidates
    .map((item) => ({
      item,
      score: Math.random() * 0.35 + (item.lastViewedAt ? Math.min(1, (now - item.lastViewedAt) / 2592000000) : 1)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(({ item }) => item);
}

export async function markViewed(id: string) {
  await db.items.update(id, { lastViewedAt: Date.now() });
}

export async function getStats() {
  const items = await db.items.toArray();
  const tags = await getAllTags();
  return {
    total: items.length,
    tags: tags.length,
    later: items.filter((item) => item.status === "later").length,
    reading: items.filter((item) => item.status === "reading").length,
    done: items.filter((item) => item.status === "done").length
  };
}
