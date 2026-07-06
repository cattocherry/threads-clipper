import Dexie, { type Table } from "dexie";
import type { ArchiveItem, TagMeta } from "./types";

export class RethreadDB extends Dexie {
  items!: Table<ArchiveItem, string>;
  tagMeta!: Table<TagMeta, string>;

  constructor() {
    super("rethread-db");
    this.version(1).stores({
      items: "id, savedAt, status, isClassified, isFavorite, *tags",
      tagMeta: "name, count"
    });
  }
}

export const db = new RethreadDB();
