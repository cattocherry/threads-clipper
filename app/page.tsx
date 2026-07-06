"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChangeEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db";
import type { ArchiveItem, LibrarySort, ReadStatus, TagMeta } from "@/lib/types";
import {
  addItem,
  confirmTags,
  deleteItem,
  deleteTag,
  exportJSON,
  getAllTags,
  getInboxItems,
  getLibraryItems,
  getRediscoveryItems,
  getStaleReadingItems,
  getStats,
  importJSON,
  markViewed,
  renameTag,
  searchItems,
  setStatus,
  updateItem
} from "@/lib/repository";

type Tab = "inbox" | "library" | "rediscover" | "settings";
type StatusFilter = ReadStatus | "all";

const STATUS_LABEL: Record<ReadStatus, string> = {
  later: "나중에 볼 것",
  reading: "읽는 중",
  done: "다 봄"
};

const STATUS_DOT: Record<ReadStatus, string> = {
  later: "bg-zinc-500",
  reading: "bg-blue-400",
  done: "bg-emerald-400"
};

const STATUS_ORDER: ReadStatus[] = ["later", "reading", "done"];

function isThreadsUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ["threads.net", "www.threads.net", "threads.com", "www.threads.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(value);
}

function daysSince(value: number) {
  return Math.max(1, Math.floor((Date.now() - value) / 86400000));
}

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function stop(event: MouseEvent) {
  event.stopPropagation();
}

function cycleStatus(status: ReadStatus) {
  return STATUS_ORDER[(STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length];
}

function Chip({
  children,
  active,
  dashed,
  onClick
}: {
  children: React.ReactNode;
  active?: boolean;
  dashed?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-8 shrink-0 rounded-full border px-3 text-xs transition",
        dashed ? "border-dashed" : "",
        active ? "border-blue-300 bg-blue-400/15 text-blue-100" : "border-zinc-700 bg-zinc-900 text-zinc-300"
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function Toast({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="fixed left-1/2 top-4 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-zinc-100 shadow-2xl">
      {message}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 bg-zinc-950/50 p-6 text-center">
      <p className="text-sm font-semibold text-zinc-100">{title}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{body}</p>
    </div>
  );
}

function Card({
  item,
  onOpen,
  onStatus,
  onFavorite,
  staleLabel
}: {
  item: ArchiveItem;
  onOpen: (item: ArchiveItem) => void;
  onStatus?: (item: ArchiveItem) => void;
  onFavorite?: (item: ArchiveItem) => void;
  staleLabel?: string;
}) {
  return (
    <article
      onClick={() => onOpen(item)}
      className="grid min-h-36 grid-cols-[5.5rem_1fr] gap-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 transition hover:border-zinc-600"
    >
      <div className="h-28 overflow-hidden rounded-md bg-zinc-900">
        {item.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-600">THREAD</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-100">
              {item.authorName || item.author || "작성자 미확인"}
            </p>
            <p className="truncate text-xs text-zinc-500">{item.author || new URL(item.url).hostname}</p>
          </div>
          {onFavorite ? (
            <button
              type="button"
              onClick={(event) => {
                stop(event);
                onFavorite(item);
              }}
              aria-label="즐겨찾기"
              className={`h-8 w-8 rounded-full border text-sm ${item.isFavorite ? "border-yellow-300 bg-yellow-300/15 text-yellow-200" : "border-zinc-800 text-zinc-500"}`}
            >
              ★
            </button>
          ) : null}
        </div>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-300">
          {item.previewText || "본문 스냅샷이 없어요. 상세에서 직접 메모를 남겨둘 수 있어요."}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300">
              #{tag}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(event) => {
              stop(event);
              onStatus?.(item);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-zinc-800 px-3 text-xs text-zinc-300"
          >
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[item.status]}`} />
            {STATUS_LABEL[item.status]}
          </button>
          <span className="min-w-0 truncate text-right text-xs text-zinc-600">{staleLabel ?? formatDate(item.savedAt)}</span>
        </div>
      </div>
    </article>
  );
}

function AddTagRow({
  tags,
  onAdd,
  placeholder = "태그 추가"
}: {
  tags: TagMeta[];
  onAdd: (tag: string) => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        list="tag-suggestions"
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-blue-400"
      />
      <datalist id="tag-suggestions">
        {tags.map((tag) => (
          <option key={tag.name} value={tag.name} />
        ))}
      </datalist>
      <button
        type="button"
        onClick={() => {
          if (!value.trim()) return;
          onAdd(value.trim());
          setValue("");
        }}
        className="h-10 rounded-lg bg-zinc-100 px-4 text-sm font-semibold text-zinc-950"
      >
        추가
      </button>
    </div>
  );
}

function DetailSheet({
  item,
  tags,
  onClose,
  onToast
}: {
  item: ArchiveItem | null;
  tags: TagMeta[];
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const [memo, setMemo] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);

  useEffect(() => {
    setMemo(item?.memo ?? "");
    setDraftTags(item?.tags ?? []);
  }, [item]);

  if (!item) return null;

  async function saveTags() {
    await updateItem(item!.id, { tags: draftTags });
    onToast("태그를 저장했어요.");
  }

  async function resuggest() {
    const response = await fetch("/api/suggest-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: item!.previewText || item!.memo || item!.url,
        existingTags: tags.map((tag) => tag.name)
      })
    });
    const data = (await response.json()) as { tags?: string[] };
    setDraftTags(Array.from(new Set([...draftTags, ...(data.tags ?? [])])));
    onToast(data.tags?.length ? "AI 제안을 추가했어요." : "새 제안이 없어요.");
  }

  async function openOriginal() {
    if (item!.status === "later") {
      await setStatus(item!.id, "reading");
    }
    await markViewed(item!.id);
    window.open(item!.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={onClose}>
      <section
        onClick={stop}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl"
      >
        <div className="mx-auto max-w-lg">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-zinc-500">{formatDate(item.savedAt)}</p>
              <h2 className="mt-1 text-lg font-bold text-zinc-50">{item.authorName || item.author || "상세 보기"}</h2>
            </div>
            <button type="button" onClick={onClose} className="h-9 w-9 rounded-full border border-zinc-800 text-zinc-400">
              ×
            </button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-200">
            {item.previewText || "저장된 본문이 없어요."}
          </p>
          <button
            type="button"
            onClick={openOriginal}
            className="mt-4 h-11 w-full rounded-lg bg-blue-400 text-sm font-semibold text-zinc-950"
          >
            원본 링크 열기
          </button>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                onClick={async () => {
                  await setStatus(item.id, status);
                  onToast(`${STATUS_LABEL[status]} 상태로 바꿨어요.`);
                }}
                className={`h-10 rounded-lg border text-sm ${item.status === status ? "border-blue-300 bg-blue-400/15 text-blue-100" : "border-zinc-800 text-zinc-400"}`}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
          <label className="mt-5 block text-sm font-semibold text-zinc-200">메모</label>
          <textarea
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            onBlur={async () => {
              await updateItem(item.id, { memo });
              onToast("메모를 저장했어요.");
            }}
            rows={4}
            className="mt-2 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-blue-400"
            placeholder="왜 저장했는지 적어두기"
          />
          <div className="mt-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">태그</h3>
            <button type="button" onClick={resuggest} className="text-xs text-blue-300">
              AI 재제안
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setDraftTags(draftTags.filter((draft) => draft !== tag))}
                className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
              >
                #{tag} ×
              </button>
            ))}
          </div>
          <div className="mt-3">
            <AddTagRow tags={tags} onAdd={(tag) => setDraftTags(Array.from(new Set([...draftTags, tag])))} />
          </div>
          <button
            type="button"
            onClick={saveTags}
            className="mt-3 h-10 w-full rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-100"
          >
            태그 저장
          </button>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={async () => {
                await updateItem(item.id, { isFavorite: !item.isFavorite });
                onToast(item.isFavorite ? "중요 표시를 해제했어요." : "중요 표시했어요.");
              }}
              className="h-10 rounded-lg border border-yellow-400/40 text-sm text-yellow-200"
            >
              {item.isFavorite ? "중요 해제" : "중요 표시"}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("이 항목을 삭제할까요?")) return;
                await deleteItem(item.id);
                onToast("삭제했어요.");
                onClose();
              }}
              className="h-10 rounded-lg border border-red-400/40 text-sm text-red-200"
            >
              삭제
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Inbox({ tags, onToast, onOpen }: { tags: TagMeta[]; onToast: (message: string) => void; onOpen: (item: ArchiveItem) => void }) {
  const items = useLiveQuery(getInboxItems, [], []);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  async function saveUrl(nextUrl = url) {
    const clean = nextUrl.trim();
    if (!clean) return;
    if (!isThreadsUrl(clean)) {
      onToast("threads.net 또는 threads.com 링크만 저장할 수 있어요.");
      return;
    }
    setBusy(true);
    setUrl("");
    const item = await addItem({ url: clean });
    onToast("먼저 저장했어요. 정보를 가져오는 중이에요.");
    try {
      const ogResponse = await fetch("/api/og", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: clean })
      });
      const og = (await ogResponse.json()) as Partial<ArchiveItem>;
      const previewText = og.previewText ?? "";
      await updateItem(item.id, {
        author: og.author ?? "",
        authorName: og.authorName,
        previewText,
        thumbnail: og.thumbnail
      });
      if (previewText) {
        const existingTags = (await getAllTags()).map((tag) => tag.name);
        const tagResponse = await fetch("/api/suggest-tags", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: previewText, existingTags })
        });
        const data = (await tagResponse.json()) as { tags?: string[] };
        setSuggestions((current) => ({ ...current, [item.id]: data.tags ?? [] }));
      }
    } catch (error) {
      console.error(error);
      onToast("외부 정보를 못 가져왔지만 링크는 저장됐어요.");
    } finally {
      setBusy(false);
    }
  }

  function toggleSuggested(itemId: string, tag: string) {
    setSelected((current) => {
      const existing = current[itemId] ?? [];
      return {
        ...current,
        [itemId]: existing.includes(tag) ? existing.filter((name) => name !== tag) : [...existing, tag]
      };
    });
  }

  return (
    <section className="space-y-4">
      <div className="sticky top-0 z-20 -mx-4 border-b border-zinc-900 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
              event.preventDefault();
              void saveUrl();
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text");
              if (isThreadsUrl(pasted)) {
                event.preventDefault();
                void saveUrl(pasted);
              }
            }}
            enterKeyHint="go"
            inputMode="url"
            placeholder="Threads 링크 붙여넣기"
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm outline-none focus:border-blue-400"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveUrl()}
            className="h-12 rounded-lg bg-zinc-100 px-4 text-sm font-bold text-zinc-950"
          >
            저장
          </button>
        </div>
      </div>
      {!items?.length ? (
        <Empty title="인박스가 비었어요" body="링크를 붙여넣으면 먼저 저장하고, 분류는 천천히 해도 돼요." />
      ) : (
        items.map((item) => {
          const suggested = suggestions[item.id] ?? [];
          const picked = selected[item.id] ?? [];
          return (
            <article key={item.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
              <div onClick={() => onOpen(item)} className="cursor-pointer">
                <p className="text-xs text-zinc-500">{item.author || "정보 수집 중"}</p>
                <p className="mt-2 text-sm leading-6 text-zinc-200">
                  {item.previewText || "정보를 가져오지 못했어요. 필요하면 아래에서 직접 적어둘 수 있어요."}
                </p>
              </div>
              {!item.previewText ? (
                <div className="mt-3 grid gap-2">
                  <input
                    placeholder="작성자"
                    className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    onBlur={(event) => updateItem(item.id, { author: event.target.value })}
                  />
                  <textarea
                    placeholder="내용 스냅샷"
                    className="resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    onBlur={(event) => updateItem(item.id, { previewText: event.target.value })}
                  />
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {suggested.map((tag) => (
                  <Chip key={tag} dashed={!picked.includes(tag)} active={picked.includes(tag)} onClick={() => toggleSuggested(item.id, tag)}>
                    #{tag}
                  </Chip>
                ))}
              </div>
              <div className="mt-3">
                <AddTagRow
                  tags={tags}
                  placeholder="직접 태그"
                  onAdd={(tag) => setSelected((current) => ({ ...current, [item.id]: Array.from(new Set([...(current[item.id] ?? []), tag])) }))}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onToast("인박스에 그대로 둘게요.")}
                  className="h-10 rounded-lg border border-zinc-800 text-sm text-zinc-300"
                >
                  나중에
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await confirmTags(item.id, picked);
                    onToast("라이브러리에 보관했어요.");
                  }}
                  className="h-10 rounded-lg bg-blue-400 text-sm font-semibold text-zinc-950"
                >
                  보관
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

function Library({ tags, onToast, onOpen }: { tags: TagMeta[]; onToast: (message: string) => void; onOpen: (item: ArchiveItem) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("newest");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const baseItems = useLiveQuery(
    () => (debounced ? searchItems(debounced) : getLibraryItems({ status, tags: selectedTags, favoriteOnly, sort })),
    [debounced, status, selectedTags.join(","), favoriteOnly, sort],
    []
  );
  const counts = useLiveQuery(async () => {
    const items = await db.items.filter((item) => item.isClassified).toArray();
    return {
      all: items.length,
      later: items.filter((item) => item.status === "later").length,
      reading: items.filter((item) => item.status === "reading").length,
      done: items.filter((item) => item.status === "done").length
    };
  }, []);

  const items = useMemo(() => {
    let next = baseItems ?? [];
    if (debounced) {
      if (status !== "all") next = next.filter((item) => item.status === status);
      if (selectedTags.length) next = next.filter((item) => selectedTags.every((tag) => item.tags.includes(tag)));
      if (favoriteOnly) next = next.filter((item) => item.isFavorite);
      if (sort === "oldest") next = [...next].sort((a, b) => a.savedAt - b.savedAt);
      if (sort === "favorite") next = [...next].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.savedAt - a.savedAt);
    }
    return next;
  }, [baseItems, debounced, favoriteOnly, selectedTags, sort, status]);

  return (
    <section className="space-y-4">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="작성자, 본문, 메모, 태그 검색"
        className="h-12 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm outline-none focus:border-blue-400"
      />
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-900 p-1">
        {(["all", "later", "reading", "done"] as StatusFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`h-10 rounded-md text-xs ${status === key ? "bg-zinc-100 text-zinc-950" : "text-zinc-400"}`}
          >
            {key === "all" ? "전체" : STATUS_LABEL[key]}
            <span className="ml-1 text-[10px] opacity-70">{counts?.[key] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={favoriteOnly} onClick={() => setFavoriteOnly(!favoriteOnly)}>
          ★ 중요
        </Chip>
        {tags.map((tag) => (
          <Chip
            key={tag.name}
            active={selectedTags.includes(tag.name)}
            onClick={() =>
              setSelectedTags((current) =>
                current.includes(tag.name) ? current.filter((name) => name !== tag.name) : [...current, tag.name]
              )
            }
          >
            #{tag.name} {tag.count}
          </Chip>
        ))}
      </div>
      <select
        value={sort}
        onChange={(event) => setSort(event.target.value as LibrarySort)}
        className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-200"
      >
        <option value="newest">최신순</option>
        <option value="oldest">오래된순</option>
        <option value="favorite">즐겨찾기 우선</option>
      </select>
      {!items.length ? (
        <Empty title="조건에 맞는 글이 없어요" body="검색어를 지우거나 태그 필터를 줄여보세요." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <Card
              key={item.id}
              item={item}
              onOpen={onOpen}
              onStatus={async (target) => {
                const next = cycleStatus(target.status);
                await setStatus(target.id, next);
                onToast(`${STATUS_LABEL[next]} 상태로 바꿨어요.`);
              }}
              onFavorite={async (target) => updateItem(target.id, { isFavorite: !target.isFavorite })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function Rediscover({ onOpen }: { onOpen: (item: ArchiveItem) => void }) {
  const [nonce, setNonce] = useState(0);
  const stale = useLiveQuery(() => getStaleReadingItems(7), [nonce], []);
  const picks = useLiveQuery(() => getRediscoveryItems(3), [nonce], []);
  const anniversaries = useLiveQuery(async () => {
    const items = await db.items.filter((item) => item.isClassified).toArray();
    const now = new Date();
    return [1, 3, 6, 12].map((month) => {
      const target = new Date(now);
      target.setMonth(now.getMonth() - month);
      const center = target.getTime();
      const range = 3 * 86400000;
      return {
        month,
        items: items.filter((item) => Math.abs(item.savedAt - center) <= range)
      };
    });
  }, [nonce], []);

  async function openAndMark(item: ArchiveItem) {
    await markViewed(item.id);
    onOpen(item);
  }

  return (
    <section className="space-y-6">
      <button
        type="button"
        onClick={() => setNonce((value) => value + 1)}
        className="h-11 w-full rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-100"
      >
        새로 섞기
      </button>
      <div>
        <h2 className="mb-3 text-sm font-bold text-zinc-100">읽다 만 글</h2>
        {!stale?.length ? (
          <Empty title="밀린 reading이 없어요" body="읽는 중으로 둔 지 7일 넘은 글이 여기에 떠요." />
        ) : (
          <div className="grid gap-3">
            {stale.map((item) => (
              <Card key={item.id} item={item} onOpen={openAndMark} staleLabel={`${daysSince(item.statusChangedAt)}일째 읽는 중`} />
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="mb-3 text-sm font-bold text-zinc-100">오늘의 발견</h2>
        <div className="grid gap-3">
          {picks?.map((item) => <Card key={item.id} item={item} onOpen={openAndMark} />)}
        </div>
      </div>
      {anniversaries?.map((group) =>
        group.items.length ? (
          <div key={group.month}>
            <h2 className="mb-3 text-sm font-bold text-zinc-100">{group.month}개월 전 그 글</h2>
            <div className="grid gap-3">
              {group.items.map((item) => (
                <Card key={item.id} item={item} onOpen={openAndMark} />
              ))}
            </div>
          </div>
        ) : null
      )}
    </section>
  );
}

function Settings({ tags, onToast }: { tags: TagMeta[]; onToast: (message: string) => void }) {
  const stats = useLiveQuery(getStats, [], { total: 0, tags: 0, later: 0, reading: 0, done: 0 });
  const [storage, setStorage] = useState("");

  useEffect(() => {
    void navigator.storage?.estimate?.().then((estimate) => {
      const used = estimate.usage ? `${(estimate.usage / 1024 / 1024).toFixed(1)}MB` : "계산 불가";
      setStorage(used);
    });
  }, [stats?.total]);

  async function handleExport() {
    const data = await exportJSON();
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    download(`rethread-backup-${date}.json`, JSON.stringify(data, null, 2));
    localStorage.setItem("rethread:lastExportAt", String(Date.now()));
    onToast("백업 파일을 만들었어요.");
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    const mode = window.confirm("기존 데이터를 지우고 가져올까요? 취소하면 병합해요.") ? "overwrite" : "merge";
    const result = await importJSON(data, mode);
    onToast(`${result.added}개 추가, ${result.updated}개 갱신, ${result.skipped}개 중복 건너뜀`);
    event.target.value = "";
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <h2 className="text-sm font-bold text-zinc-100">백업</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={handleExport} className="h-11 rounded-lg bg-zinc-100 text-sm font-semibold text-zinc-950">
            JSON 내보내기
          </button>
          <label className="flex h-11 items-center justify-center rounded-lg border border-zinc-700 text-sm font-semibold text-zinc-100">
            JSON 가져오기
            <input type="file" accept="application/json,.json" onChange={handleImport} className="hidden" />
          </label>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <h2 className="text-sm font-bold text-zinc-100">통계</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-300">
          <p>총 항목 {stats?.total ?? 0}</p>
          <p>태그 {stats?.tags ?? 0}</p>
          <p>나중에 {stats?.later ?? 0}</p>
          <p>읽는 중 {stats?.reading ?? 0}</p>
          <p>다 봄 {stats?.done ?? 0}</p>
          <p>사용량 {storage}</p>
        </div>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <h2 className="text-sm font-bold text-zinc-100">태그 관리</h2>
        <div className="mt-3 space-y-2">
          {tags.map((tag) => (
            <div key={tag.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-lg bg-zinc-900 p-2">
              <span className="min-w-0 truncate text-sm text-zinc-200">
                #{tag.name} <span className="text-zinc-500">{tag.count}</span>
              </span>
              <button
                type="button"
                onClick={async () => {
                  const next = window.prompt("새 태그 이름", tag.name);
                  if (!next) return;
                  await renameTag(tag.name, next);
                  onToast("태그 이름을 바꿨어요.");
                }}
                className="h-8 rounded-md border border-zinc-700 px-3 text-xs text-zinc-300"
              >
                변경
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`#${tag.name} 태그를 삭제할까요?`)) return;
                  await deleteTag(tag.name);
                  onToast("태그를 삭제했어요.");
                }}
                className="h-8 rounded-md border border-red-400/40 px-3 text-xs text-red-200"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [toast, setToast] = useState("");
  const [selected, setSelected] = useState<ArchiveItem | null>(null);
  const tags = useLiveQuery(getAllTags, [], []);
  const lastExportAt = typeof window !== "undefined" ? Number(localStorage.getItem("rethread:lastExportAt") ?? 0) : 0;
  const needsBackup = !lastExportAt || Date.now() - lastExportAt > 30 * 86400000;

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  const title: Record<Tab, string> = {
    inbox: "인박스",
    library: "라이브러리",
    rediscover: "다시보기",
    settings: "설정"
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg px-4 pb-24 pt-5">
      <Toast message={toast} />
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.25em] text-blue-300">RETHREAD</p>
          <h1 className="mt-1 text-2xl font-black text-zinc-50">{title[tab]}</h1>
        </div>
        <button
          type="button"
          onClick={() => setTab("settings")}
          aria-label="설정"
          className="relative h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950 text-zinc-300"
        >
          ⚙
          {needsBackup ? <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-blue-300" /> : null}
        </button>
      </header>
      {tab === "inbox" ? <Inbox tags={tags ?? []} onToast={showToast} onOpen={setSelected} /> : null}
      {tab === "library" ? <Library tags={tags ?? []} onToast={showToast} onOpen={setSelected} /> : null}
      {tab === "rediscover" ? <Rediscover onOpen={setSelected} /> : null}
      {tab === "settings" ? <Settings tags={tags ?? []} onToast={showToast} /> : null}
      <DetailSheet item={selected} tags={tags ?? []} onClose={() => setSelected(null)} onToast={showToast} />
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-30 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-1 px-3 py-2">
          {[
            ["inbox", "인박스"],
            ["library", "라이브러리"],
            ["rediscover", "다시보기"],
            ["settings", "설정"]
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as Tab)}
              className={`h-11 rounded-lg text-xs font-semibold ${tab === key ? "bg-zinc-100 text-zinc-950" : "text-zinc-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
