<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import AdminNav from "./AdminNav.svelte";

  import type {
    AdminCatalogItem,
    AdminContent,
    AdminListItem,
    AdminStats,
    ReviewReason
  } from "./d1-admin-content";
  import {
    contentKinds,
    contentMoods,
    contentTopics,
    isContentKind,
    isContentTheme,
    type ContentKind,
    type ContentMood,
    type ContentStatus,
    type ContentTheme,
    type ContentTopic
  } from "../content/content.types";
  import { readContentFormat } from "../content/content-format";
  import {
    layoutLabel,
    mediaLayout,
    readFileMediaSize,
    readUrlMediaSize,
    type MediaSize
  } from "../media/media-dimensions";
  import { lookFromTopic } from "../content/topic-look";

  const PAGE_SIZE = 12;

  const kindLabels: Record<ContentKind, string> = {
    quote: "Châm ngôn",
    story: "Câu chuyện",
    fact: "Kiến thức",
    psychology: "Tâm lý học",
    insight: "Góc nhìn",
    cute: "Điều dễ thương",
    tip: "Mẹo hữu ích"
  };

  const statusLabels: Record<ContentStatus, string> = {
    draft: "Bản nháp",
    published: "Đã xuất bản",
    archived: "Lưu trữ"
  };

  const cardTones: Record<ContentTheme, { wash: string; ink: string }> = {
    peace: { wash: "var(--color-theme-peace)", ink: "var(--color-accent-peace)" },
    discovery: {
      wash: "var(--color-theme-discovery)",
      ink: "var(--color-accent-discovery)"
    },
    story: { wash: "var(--color-theme-story)", ink: "var(--color-accent-story)" },
    nature: {
      wash: "var(--color-theme-nature)",
      ink: "var(--color-accent-nature)"
    },
    psychology: {
      wash: "var(--color-theme-psychology)",
      ink: "var(--color-accent-psychology)"
    },
    cute: { wash: "var(--color-theme-cute)", ink: "var(--color-accent-cute)" }
  };

  const reasonLabels: Record<ReviewReason, string> = {
    topic: "Thiếu chủ đề"
  };

  const tabs: Array<{ id: "all" | ContentStatus; label: string }> = [
    { id: "all", label: "Tất cả" },
    { id: "published", label: "Đã xuất bản" },
    { id: "draft", label: "Bản nháp" },
    { id: "archived", label: "Lưu trữ" }
  ];

  interface CollectionOption {
    id: string;
    title: string;
    status: string;
  }

  interface DraftForm {
    title: string;
    format: "text" | "image" | "video" | "poll";
    topics: ContentTopic[];
    moods: ContentMood[];
    sourceLabel: string;
    sourceUrl: string;
    body: string;
    imageUrl: string;
    imageAlt: string;
    imageWidth: string;
    imageHeight: string;
    posterUrl: string;
    pollOptions: string[];
    collectionIds: string[];
  }

  function emptyForm(): DraftForm {
    return {
      title: "",
      format: "text",
      topics: [],
      moods: [],
      sourceLabel: "",
      sourceUrl: "",
      body: "",
      imageUrl: "",
      imageAlt: "",
      imageWidth: "",
      imageHeight: "",
      posterUrl: "",
      pollOptions: ["", ""],
      collectionIds: []
    };
  }

  function formSnapshot(value: DraftForm): string {
    return JSON.stringify(value);
  }

  interface Props {
    initialItems: AdminListItem[];
    initialCursor: string | null;
    initialTotal: number;
    initialStats: AdminStats;
    initialTopics: AdminCatalogItem[];
    initialMoods: AdminCatalogItem[];
    initialCollections?: CollectionOption[];
    pending: number;
  }

  let {
    initialItems,
    initialCursor,
    initialTotal,
    initialStats,
    initialTopics,
    initialMoods,
    initialCollections = [],
    pending
  }: Props = $props();

  let query = $state("");
  let statusFilter = $state<"all" | ContentStatus>("all");
  let kindFilter = $state<ContentKind | "">("");
  let topicFilter = $state<ContentTopic | "">("");
  let sort = $state<"updated" | "created">("updated");
  let reviewOnly = $state(false);
  let items = $state(initialItems);
  let nextCursor = $state(initialCursor);
  let total = $state(initialTotal);
  let stats = $state(initialStats);
  let pageCursors = $state<(string | null)[]>(
    initialCursor ? [null, initialCursor] : [null]
  );
  let pageIndex = $state(0);
  let topics = $state(initialTopics);
  let moods = $state(initialMoods);
  let collectionChoices = $state(initialCollections.map((item) => ({ ...item })));
  let listLoading = $state(false);
  let listError = $state("");
  let detailLoading = $state(false);
  let saving = $state(false);
  let mediaUploading = $state(false);
  let mediaMeasuring = $state(false);
  let confirmArchive = $state(false);
  let sizeProbeTicket = 0;
  let sizeProbeTimer: ReturnType<typeof setTimeout> | undefined;
  let content = $state<AdminContent | null>(null);
  let form = $state(emptyForm());
  let savedForm = $state(formSnapshot(emptyForm()));
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(
    null
  );
  let editor = $state<HTMLDialogElement | null>(null);

  let listTicket = 0;
  let detailTicket = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  let topicChoices = $derived(
    topics.filter(
      (item): item is { slug: ContentTopic; label: string } =>
        (contentTopics as readonly string[]).includes(item.slug)
    )
  );
  let moodChoices = $derived(
    moods.filter(
      (item): item is { slug: ContentMood; label: string } =>
        (contentMoods as readonly string[]).includes(item.slug)
    )
  );
  let previewLook = $derived(
    form.topics[0] ? lookFromTopic(form.topics[0]) : null
  );
  let previewTheme = $derived(previewLook?.theme ?? "peace");
  let previewCategory = $derived(
    previewLook?.category ?? "Chọn chủ đề để xem nhóm"
  );
  let archived = $derived(content?.status === "archived");
  let dirty = $derived(formSnapshot(form) !== savedForm);
  let safeUrl = $derived.by(() => {
    const value = form.sourceUrl.trim();

    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.href;
      }
    } catch {
      return "";
    }

    return "";
  });
  let resultLabel = $derived.by(() => {
    if (total === 0) return "0 kết quả";
    const from = pageIndex * PAGE_SIZE + 1;
    const to = pageIndex * PAGE_SIZE + items.length;
    return `${from}–${to} / ${total} kết quả`;
  });

  function record(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object") return null;
    return value as Record<string, unknown>;
  }

  function isStatus(value: unknown): value is ContentStatus {
    return (
      value === "draft" ||
      value === "published" ||
      value === "archived"
    );
  }

  function isReason(value: unknown): value is ReviewReason {
    return value === "topic";
  }

  function readListItem(value: unknown): AdminListItem | null {
    const row = record(value);

    if (!row) return null;

    const {
      id,
      title,
      description,
      category,
      kind,
      theme,
      status,
      createdAt,
      updatedAt
    } = row;

    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof description !== "string" ||
      typeof category !== "string" ||
      typeof kind !== "string" ||
      typeof theme !== "string" ||
      !isContentKind(kind) ||
      !isContentTheme(theme) ||
      !isStatus(status) ||
      typeof createdAt !== "number" ||
      typeof updatedAt !== "number" ||
      !Array.isArray(row.topics) ||
      !Array.isArray(row.reviewReasons)
    ) {
      return null;
    }

    return {
      id,
      title,
      description,
      category,
      kind,
      theme,
      status,
      topics: row.topics.filter(
        (topic): topic is ContentTopic =>
          typeof topic === "string" &&
          (contentTopics as readonly string[]).includes(topic)
      ),
      reviewReasons: row.reviewReasons.filter(isReason),
      createdAt,
      updatedAt
    };
  }

  function readContent(value: unknown): AdminContent | null {
    const row = record(value);
    const item = readListItem({
      ...(row ?? {}),
      topics: row?.topics,
      reviewReasons: [],
      createdAt: row?.updatedAt,
      description: row?.description
    });

    if (
      !row ||
      !item ||
      typeof row.slug !== "string" ||
      typeof row.tag !== "string" ||
      typeof row.sourceLabel !== "string" ||
      typeof row.sourceUrl !== "string" ||
      typeof row.body !== "string" ||
      !Array.isArray(row.moods) ||
      !(row.publishedAt === null || typeof row.publishedAt === "number")
    ) {
      return null;
    }

    const pollOptions = Array.isArray(row.pollOptions)
      ? row.pollOptions.filter(
          (item): item is string => typeof item === "string"
        )
      : [];

    const imageWidth =
      typeof row.imageWidth === "number" ? row.imageWidth : null;
    const imageHeight =
      typeof row.imageHeight === "number" ? row.imageHeight : null;

    return {
      ...item,
      format: readContentFormat(row.format),
      slug: row.slug,
      tag: row.tag,
      moods: row.moods.filter(
        (mood): mood is ContentMood =>
          typeof mood === "string" &&
          (contentMoods as readonly string[]).includes(mood)
      ),
      sourceLabel: row.sourceLabel,
      sourceUrl: row.sourceUrl,
      body: row.body,
      imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : "",
      imageAlt: typeof row.imageAlt === "string" ? row.imageAlt : "",
      imageWidth,
      imageHeight,
      posterUrl: typeof row.posterUrl === "string" ? row.posterUrl : "",
      pollOptions,
      collectionIds: Array.isArray(row.collectionIds)
        ? row.collectionIds.filter(
            (id): id is string => typeof id === "string"
          )
        : [],
      publishedAt: row.publishedAt
    };
  }

  function readCatalog(value: unknown): AdminCatalogItem[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((item) => {
      const row = record(item);

      if (
        !row ||
        typeof row.slug !== "string" ||
        typeof row.label !== "string"
      ) {
        return [];
      }

      return [{ slug: row.slug, label: row.label }];
    });
  }

  function readStats(value: unknown): AdminStats | null {
    const row = record(value);

    if (
      !row ||
      typeof row.total !== "number" ||
      typeof row.published !== "number" ||
      typeof row.drafts !== "number" ||
      typeof row.review !== "number"
    ) {
      return null;
    }

    return {
      total: row.total,
      published: row.published,
      drafts: row.drafts,
      review: row.review
    };
  }

  function errorText(body: unknown, fallback: string): string {
    const row = record(body);
    const message = row?.error;

    if (typeof message !== "string" || !message) return fallback;
    if (message === "Unauthorized") {
      return "Phiên đăng nhập đã hết. Hãy đăng nhập lại.";
    }
    if (message === "Content not found") return "Không tìm thấy bài.";
    if (message === "Content cannot change to that status") {
      return "Không đổi được trạng thái này.";
    }

    return message;
  }

  function remember() {
    savedForm = formSnapshot(form);
  }

  function confirmDiscard(): boolean {
    if (!dirty) return true;
    return confirm("Bài đang soạn chưa được lưu. Đóng chứ?");
  }

  function loseAccess() {
    window.location.replace("/admin/login");
  }

  async function requestJson(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);

    if (init.body) headers.set("content-type", "application/json");

    const response = await fetch(path, { ...init, headers });
    const text = await response.text();
    let body: unknown = null;

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    return { response, body };
  }

  function applyMeasuredSize(size: MediaSize | null) {
    if (!size) return;
    form.imageWidth = String(size.width);
    form.imageHeight = String(size.height);
  }

  function clearMeasuredSize() {
    form.imageWidth = "";
    form.imageHeight = "";
  }

  let measuredHint = $derived.by(() => {
    const width = Number(form.imageWidth);
    const height = Number(form.imageHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return "";
    const layout = mediaLayout(width, height);
    const label = layoutLabel(layout);
    return label
      ? `Đã đo ${width}×${height}px (${label}) — thẻ sẽ giữ đúng tỉ lệ.`
      : `Đã đo ${width}×${height}px — thẻ sẽ giữ đúng tỉ lệ.`;
  });

  async function uploadMediaFile(
    file: File,
    kind: "image" | "video",
    target: "main" | "poster"
  ) {
    if (mediaUploading || detailLoading || archived || saving) return;

    mediaUploading = true;
    notice = null;

    const measureMain =
      target === "main" ? readFileMediaSize(file) : Promise.resolve(null);

    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("kind", kind);

      const [response, measured] = await Promise.all([
        fetch("/api/admin/media", {
          method: "POST",
          body: payload
        }),
        measureMain
      ]);
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        loseAccess();
        return;
      }

      const row = record(body);
      if (
        !response.ok ||
        row?.success !== true ||
        typeof row.url !== "string"
      ) {
        notice = {
          tone: "error",
          text: errorText(body, "Không tải được tệp lên kho media.")
        };
        return;
      }

      if (target === "poster") {
        form.posterUrl = row.url;
      } else {
        form.imageUrl = row.url;
        sizeProbeTicket += 1;
        if (measured) applyMeasuredSize(measured);
        else clearMeasuredSize();
      }

      notice = {
        tone: "ok",
        text:
          target === "main" && measured
            ? `Đã lưu kho media · ${measured.width}×${measured.height}px.`
            : "Đã lưu vào kho media."
      };
    } catch {
      notice = {
        tone: "error",
        text: "Không có kết nối khi tải tệp."
      };
    } finally {
      mediaUploading = false;
    }
  }

  function onMediaPicked(
    event: Event,
    kind: "image" | "video",
    target: "main" | "poster"
  ) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    const file = input.files[0];
    input.value = "";
    void uploadMediaFile(file, kind, target);
  }

  /** Khi dan URL (khong upload): thu do metadata neu trinh duyet cho phep. */
  function scheduleProbeMediaUrl(url: string, kind: "image" | "video") {
    clearTimeout(sizeProbeTimer);
    const trimmed = url.trim();
    if (!trimmed) {
      sizeProbeTicket += 1;
      clearMeasuredSize();
      mediaMeasuring = false;
      return;
    }

    mediaMeasuring = true;
    sizeProbeTimer = setTimeout(() => {
      void probeMediaUrlSize(trimmed, kind);
    }, 280);
  }

  async function probeMediaUrlSize(url: string, kind: "image" | "video") {
    const ticket = ++sizeProbeTicket;
    try {
      const size = await readUrlMediaSize(url, kind);
      if (ticket !== sizeProbeTicket) return;
      if (size) applyMeasuredSize(size);
      else clearMeasuredSize();
    } finally {
      if (ticket === sizeProbeTicket) mediaMeasuring = false;
    }
  }

  function resetPages() {
    pageCursors = [null];
    pageIndex = 0;
  }

  function storeNext(cursor: string | null) {
    const kept = pageCursors.slice(0, pageIndex + 1);
    pageCursors = cursor ? [...kept, cursor] : kept;
  }

  function applyList(body: unknown) {
    const row = record(body);
    items = Array.isArray(row?.items)
      ? row.items.flatMap((item) => {
          const next = readListItem(item);
          return next ? [next] : [];
        })
      : [];
    nextCursor =
      typeof row?.nextCursor === "string" ? row.nextCursor : null;
    total = typeof row?.total === "number" ? row.total : 0;
    storeNext(nextCursor);

    const nextStats = readStats(row?.stats);
    if (nextStats) stats = nextStats;

    const nextTopics = readCatalog(row?.topics);
    const nextMoods = readCatalog(row?.moods);
    if (nextTopics.length > 0) topics = nextTopics;
    if (nextMoods.length > 0) moods = nextMoods;
  }

  async function loadList(): Promise<boolean> {
    const ticket = ++listTicket;
    listLoading = true;
    listError = "";
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("catalog", topics.length > 0 ? "0" : "1");
    params.set("sort", sort);

    if (statusFilter !== "all") params.set("status", statusFilter);
    if (kindFilter) params.set("kind", kindFilter);
    if (topicFilter) params.set("topic", topicFilter);
    if (reviewOnly) params.set("review", "1");

    const term = query.trim();
    if (term) params.set("q", term);

    const cursor = pageCursors[pageIndex];
    if (cursor) params.set("cursor", cursor);

    try {
      const { response, body } = await requestJson(
        `/api/admin/contents?${params}`
      );

      if (ticket !== listTicket) return false;
      if (response.status === 401) {
        loseAccess();
        return false;
      }

      if (!response.ok) {
        listError = errorText(body, "Không tải được danh sách.");
        return false;
      }

      applyList(body);
      return true;
    } catch {
      if (ticket !== listTicket) return false;
      listError = "Không có kết nối.";
      return false;
    } finally {
      if (ticket === listTicket) listLoading = false;
    }
  }

  function toForm(next: AdminContent): DraftForm {
    const pollOptions =
      next.pollOptions.length >= 2
        ? [...next.pollOptions]
        : ["", ""];
    const format =
      next.format === "poll" ||
      next.format === "image" ||
      next.format === "video"
        ? next.format
        : "text";

    return {
      title: next.title,
      format,
      topics: next.topics,
      moods: next.moods,
      sourceLabel: next.sourceLabel,
      sourceUrl: next.sourceUrl,
      body: next.body,
      imageUrl: next.imageUrl,
      imageAlt: next.imageAlt,
      imageWidth:
        next.imageWidth === null ? "" : String(next.imageWidth),
      imageHeight:
        next.imageHeight === null ? "" : String(next.imageHeight),
      posterUrl: next.posterUrl,
      pollOptions,
      collectionIds: [...next.collectionIds]
    };
  }

  function showEditor() {
    queueMicrotask(() => {
      if (editor && !editor.open) editor.showModal();
    });
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      resetPages();
      void loadList();
    }, 180);
  }

  function cancelSearch() {
    clearTimeout(searchTimer);
  }

  function chooseTab(next: "all" | ContentStatus) {
    cancelSearch();
    if (statusFilter === next && !reviewOnly) return;
    statusFilter = next;
    reviewOnly = false;
    resetPages();
    void loadList();
  }

  function showReview() {
    cancelSearch();
    reviewOnly = true;
    statusFilter = "all";
    kindFilter = "";
    topicFilter = "";
    query = "";
    sort = "updated";
    resetPages();
    void loadList();
  }

  function chooseKind(event: Event) {
    cancelSearch();
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    const next = target.value;
    if (next !== "" && !isContentKind(next)) return;
    kindFilter = next;
    resetPages();
    void loadList();
  }

  function chooseTopic(event: Event) {
    cancelSearch();
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    const next = target.value;
    if (
      next !== "" &&
      !(contentTopics as readonly string[]).includes(next)
    ) {
      return;
    }
    topicFilter = next as ContentTopic | "";
    resetPages();
    void loadList();
  }

  function chooseSort(event: Event) {
    cancelSearch();
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.value !== "updated" && target.value !== "created") {
      return;
    }
    if (sort === target.value) return;
    sort = target.value;
    resetPages();
    void loadList();
  }

  function goNext() {
    if (!pageCursors[pageIndex + 1] || listLoading) return;
    pageIndex += 1;
    void loadList();
  }

  function goPrev() {
    if (pageIndex === 0 || listLoading) return;
    pageIndex -= 1;
    void loadList();
  }

  async function openItem(item: AdminListItem) {
    if (
      editor?.open &&
      content?.id !== item.id &&
      !confirmDiscard()
    ) {
      return;
    }

    showEditor();
    confirmArchive = false;
    notice = null;

    if (content?.id === item.id && !detailLoading) return;

    const ticket = ++detailTicket;
    detailLoading = true;

    try {
      const { response, body } = await requestJson(
        `/api/admin/contents/${item.id}`
      );

      if (ticket !== detailTicket) return;
      if (response.status === 401) return loseAccess();

      const next = readContent(record(body)?.content);

      if (!response.ok || !next) {
        notice = {
          tone: "error",
          text: errorText(body, "Không mở được bài.")
        };
        return;
      }

      content = next;
      form = toForm(next);
      remember();
    } catch {
      if (ticket !== detailTicket) return;
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      if (ticket === detailTicket) detailLoading = false;
    }
  }

  function startNew() {
    if (editor?.open && !confirmDiscard()) return;

    detailTicket += 1;
    detailLoading = false;
    content = null;
    form = emptyForm();
    remember();
    confirmArchive = false;
    notice = null;
    showEditor();
  }

  function requestClose() {
    if (!confirmDiscard()) return;
    confirmArchive = false;
    editor?.close();
  }

  function onDialogCancel(event: Event) {
    if (confirmDiscard()) return;
    event.preventDefault();
  }

  async function changeStatus(
    id: string,
    status: ContentStatus
  ): Promise<{ publishedAt: number | null } | null> {
    const { response, body } = await requestJson(
      `/api/admin/contents/${id}/status`,
      {
        method: "POST",
        body: JSON.stringify({ status })
      }
    );

    if (response.status === 401) {
      loseAccess();
      return null;
    }

    const row = record(body);
    const publishedAt = row?.publishedAt;

    if (
      !response.ok ||
      !(publishedAt === null || typeof publishedAt === "number")
    ) {
      notice = {
        tone: "error",
        text: errorText(body, "Không đổi được trạng thái.")
      };
      return null;
    }

    return { publishedAt };
  }

  async function save(publish: boolean) {
    if (saving || detailLoading || archived) return;

    if (!form.title.trim() || form.topics.length === 0) {
      notice = {
        tone: "error",
        text:
          form.format === "poll"
            ? "Hãy nhập câu hỏi và chọn ít nhất một chủ đề."
            : form.format === "image"
              ? "Hãy nhập chú thích và chọn ít nhất một chủ đề."
              : form.format === "video"
                ? "Hãy nhập chú thích video và chọn ít nhất một chủ đề."
                : "Hãy nhập câu chữ chính và chọn ít nhất một chủ đề."
      };
      return;
    }

    if (
      (form.format === "image" || form.format === "video") &&
      !form.imageUrl.trim()
    ) {
      notice = {
        tone: "error",
        text:
          form.format === "video"
            ? "Hãy dán URL video hoặc tải tệp lên."
            : "Hãy dán URL ảnh hoặc tải tệp lên."
      };
      return;
    }

    if (form.format === "poll") {
      const filled = form.pollOptions
        .map((item) => item.trim())
        .filter(Boolean);

      if (filled.length < 2 || filled.length > 4) {
        notice = {
          tone: "error",
          text: "Khảo sát cần 2 đến 4 đáp án."
        };
        return;
      }
    }

    if (form.sourceUrl.trim() && !safeUrl) {
      notice = {
        tone: "error",
        text: "Liên kết nguồn không hợp lệ."
      };
      return;
    }

    saving = true;
    notice = null;
    const editing = content;
    const created = !editing;

    try {
      const { response, body } = await requestJson(
        editing
          ? `/api/admin/contents/${editing.id}`
          : "/api/admin/contents",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            ...form,
            imageWidth: form.imageWidth.trim() || null,
            imageHeight: form.imageHeight.trim() || null,
            pollOptions:
              form.format === "poll"
                ? form.pollOptions.map((item) => item.trim()).filter(Boolean)
                : []
          })
        }
      );

      if (response.status === 401) return loseAccess();

      const saved = readContent(record(body)?.content);

      if (!response.ok || !saved) {
        notice = {
          tone: "error",
          text: errorText(body, "Không lưu được bài.")
        };
        return;
      }

      content = saved;
      form = toForm(saved);
      remember();

      if (publish && saved.status === "draft") {
        const published = await changeStatus(saved.id, "published");

        if (!published || !content) {
          if (created) resetPages();
          await loadList();
          return;
        }

        content = {
          ...content,
          status: "published",
          publishedAt: published.publishedAt
        };
        notice = { tone: "ok", text: "Đã xuất bản." };
      } else {
        notice = {
          tone: "ok",
          text: publish ? "Bài đang hiện trên feed." : "Đã lưu."
        };
      }

      if (created) resetPages();
      await loadList();
    } catch {
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      saving = false;
      confirmArchive = false;
    }
  }

  async function unpublish() {
    if (!content || content.status !== "published" || saving) return;
    if (dirty) {
      notice = {
        tone: "error",
        text: "Hãy lưu thay đổi trước khi gỡ xuất bản."
      };
      return;
    }
    if (!confirm("Gỡ bài này khỏi feed và đưa về bản nháp?")) return;

    saving = true;
    const current = content;
    const result = await changeStatus(current.id, "draft");
    saving = false;

    if (!result) return;

    content = {
      ...current,
      status: "draft",
      publishedAt: result.publishedAt ?? current.publishedAt
    };
    notice = {
      tone: "ok",
      text: "Đã gỡ xuất bản. Bài không còn trên feed."
    };
    await loadList();
  }

  async function archive() {
    if (!content || saving || detailLoading || archived) return;

    if (!confirmArchive) {
      if (dirty) {
        notice = {
          tone: "error",
          text: "Hãy lưu thay đổi trước khi lưu trữ."
        };
        return;
      }
      confirmArchive = true;
      return;
    }

    saving = true;
    const current = content;
    const result = await changeStatus(current.id, "archived");
    saving = false;
    confirmArchive = false;

    if (!result) return;

    content = {
      ...current,
      status: "archived",
      publishedAt: result.publishedAt ?? current.publishedAt
    };
    form = toForm(content);
    remember();
    notice = {
      tone: "ok",
      text: "Đã lưu trữ. Bài không còn trên feed."
    };
    await loadList();
  }

  function toggleCollection(id: string) {
    form.collectionIds = form.collectionIds.includes(id)
      ? form.collectionIds.filter((item) => item !== id)
      : [...form.collectionIds, id];
  }

  function toggleTopic(slug: ContentTopic) {
    form.topics = form.topics.includes(slug)
      ? form.topics.filter((item) => item !== slug)
      : [...form.topics, slug];
  }

  function toggleMood(slug: ContentMood) {
    form.moods = form.moods.includes(slug)
      ? form.moods.filter((item) => item !== slug)
      : [...form.moods, slug];
  }

  function setFormat(next: "text" | "image" | "video" | "poll") {
    form.format = next;
    if (next === "poll" && form.pollOptions.length < 2) {
      form.pollOptions = ["", ""];
    }
  }

  function setPollOption(index: number, value: string) {
    form.pollOptions = form.pollOptions.map((item, at) =>
      at === index ? value : item
    );
  }

  function addPollOption() {
    if (form.pollOptions.length >= 4) return;
    form.pollOptions = [...form.pollOptions, ""];
  }

  function removePollOption(index: number) {
    if (form.pollOptions.length <= 2) return;
    form.pollOptions = form.pollOptions.filter((_, at) => at !== index);
  }

  function topicLabel(slug: string): string {
    return topics.find((item) => item.slug === slug)?.label ?? slug;
  }

  function dateLabel(seconds: number): string {
    return new Intl.DateTimeFormat("vi", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(new Date(seconds * 1000));
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!editor?.open || formSnapshot(form) === savedForm) return;
    event.preventDefault();
  }

  async function leave() {
    if (editor?.open && !confirmDiscard()) return;

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Cookie het han van dua ve trang dang nhap.
    }

    window.location.replace("/admin/login");
  }

  onMount(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
  });

  onDestroy(() => {
    clearTimeout(searchTimer);
    clearTimeout(sizeProbeTimer);
    if (typeof window === "undefined") return;
    window.removeEventListener("beforeunload", onBeforeUnload);
  });
</script>

<div class="desk">
  <div class="shell">
      <AdminNav current="contents" onleave={leave} {pending} />

      <main class="main">
        <header class="page-head">
          <div>
            <h1>Quản lý nội dung</h1>
            <p>
              Mỗi bài là một thẻ. Bấm mũi tên để mở và sửa. Danh sách tải từng trang.
            </p>
          </div>
          <button class="add-content" type="button" onclick={startNew}>
            <span class="add-mark" aria-hidden="true">+</span>
            Thêm nội dung
          </button>
        </header>

        <section class="stats" aria-label="Thống kê nội dung">
          <button type="button" class="stat" onclick={() => chooseTab("all")}>
            <span class="stat-value">{stats.total}</span>
            <span class="stat-label">Tổng nội dung</span>
          </button>
          <button
            type="button"
            class="stat"
            onclick={() => chooseTab("published")}
          >
            <span class="stat-value">{stats.published}</span>
            <span class="stat-label">Đã xuất bản</span>
          </button>
          <button
            type="button"
            class="stat"
            onclick={() => chooseTab("draft")}
          >
            <span class="stat-value">{stats.drafts}</span>
            <span class="stat-label">Bản nháp</span>
          </button>
          <button
            type="button"
            class="stat"
            class:active={reviewOnly}
            onclick={showReview}
          >
            <span class="stat-value">{stats.review}</span>
            <span class="stat-label">Cần rà soát</span>
          </button>
        </section>

        <div class="tabs" role="tablist" aria-label="Trạng thái">
          {#each tabs as tab (tab.id)}
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === tab.id && !reviewOnly}
              onclick={() => chooseTab(tab.id)}
            >
              {tab.label}
            </button>
          {/each}
        </div>

        <div class="toolbar">
          <label class="search">
            <span class="visually-hidden">Tìm theo tiêu đề hoặc mô tả</span>
            <input
              type="search"
              placeholder="Tìm tiêu đề hoặc mô tả"
              bind:value={query}
              oninput={scheduleSearch}
            />
          </label>
          <label>
            <span class="visually-hidden">Loại nội dung</span>
            <select value={kindFilter} onchange={chooseKind}>
              <option value="">Mọi loại</option>
              {#each contentKinds as kind (kind)}
                <option value={kind}>{kindLabels[kind]}</option>
              {/each}
            </select>
          </label>
          <label>
            <span class="visually-hidden">Chủ đề</span>
            <select value={topicFilter} onchange={chooseTopic}>
              <option value="">Mọi chủ đề</option>
              {#each topicChoices as topic (topic.slug)}
                <option value={topic.slug}>{topic.label}</option>
              {/each}
            </select>
          </label>
          <label>
            <span class="visually-hidden">Sắp xếp</span>
            <select value={sort} onchange={chooseSort}>
              <option value="updated">Ngày cập nhật</option>
              <option value="created">Ngày tạo</option>
            </select>
          </label>
        </div>

        <p class="result-line" aria-live="polite">
          {#if reviewOnly}
            Đang xem bài thiếu mô tả hoặc thiếu chủ đề.
          {/if}
          {resultLabel}
          {#if listLoading}
            <span> Đang tải…</span>
          {/if}
        </p>
        {#if listError}
          <p class="notice error" role="alert">{listError}</p>
        {/if}

        <ul class="content-cards" aria-busy={listLoading} aria-label="Danh sách nội dung">
          {#if items.length === 0 && listLoading}
            <li class="empty">Đang tải danh sách…</li>
          {:else if items.length === 0 && listError}
            <li class="empty">Không tải được dữ liệu.</li>
          {:else if items.length === 0}
            <li class="empty">Không có bài nào khớp.</li>
          {:else}
            {#each items as item (item.id)}
              {@const tone = cardTones[item.theme]}
              <li style:--wash={tone.wash} style:--ink={tone.ink}>
                <div class="content-top">
                  <span class="kind">{kindLabels[item.kind]}</span>
                  <div class="content-tools">
                    <span class="status status-{item.status}">
                      {statusLabels[item.status]}
                    </span>
                    <button
                      type="button"
                      class="open-card"
                      aria-label={`Chỉnh sửa ${item.title}`}
                      onclick={() => openItem(item)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M7 16.5 16.5 7M10.5 7H17v6.5" />
                      </svg>
                    </button>
                  </div>
                </div>
                <h2>{item.title}</h2>
                {#if item.description}
                  <p class="excerpt">{item.description}</p>
                {/if}
                {#if item.reviewReasons.length > 0}
                  <p class="review-note">
                    {item.reviewReasons
                      .map((reason) => reasonLabels[reason])
                      .join(", ")}
                  </p>
                {/if}
                <div class="content-meta">
                  <span>
                    {item.topics.length
                      ? item.topics.map(topicLabel).join(" · ")
                      : "Chưa có chủ đề"}
                  </span>
                  <time
                    datetime={new Date(
                      (sort === "created" ? item.createdAt : item.updatedAt) *
                        1000
                    ).toISOString()}
                  >
                    {sort === "created" ? "Tạo" : "Cập nhật"}
                    {dateLabel(
                      sort === "created" ? item.createdAt : item.updatedAt
                    )}
                  </time>
                </div>
              </li>
            {/each}
          {/if}
        </ul>

        <div class="pager">
          <button
            type="button"
            onclick={goPrev}
            disabled={listLoading || pageIndex === 0}
          >
            Trước
          </button>
          <button
            type="button"
            onclick={goNext}
            disabled={listLoading || !pageCursors[pageIndex + 1]}
          >
            Sau
          </button>
        </div>
      </main>
    </div>

    <dialog
      class="editor"
      bind:this={editor}
      aria-labelledby="editor-title"
      oncancel={onDialogCancel}
    >
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <header class="editor-head">
          <div>
            <h2 id="editor-title">
              {content ? "Chỉnh sửa nội dung" : "Thêm nội dung"}
            </h2>
            {#if content}
              <p class="status status-{content.status}">
                {statusLabels[content.status]}
              </p>
            {/if}
          </div>
          <button
            type="button"
            class="text-button"
            onclick={requestClose}
          >
            Đóng
          </button>
        </header>

        {#if notice}
          <p
            class="notice"
            class:error={notice.tone === "error"}
            class:ok={notice.tone === "ok"}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        {/if}

        <div class="editor-grid">
          <fieldset disabled={detailLoading || archived || saving}>
            {#if detailLoading}
              <p>Đang mở bài…</p>
            {/if}
            <p class="field-label" id="format-label">Định dạng</p>
            <div class="chips" role="group" aria-labelledby="format-label">
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "text"}
                onclick={() => setFormat("text")}
              >
                Chữ
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "image"}
                onclick={() => setFormat("image")}
              >
                Ảnh
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "video"}
                onclick={() => setFormat("video")}
              >
                Video
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "poll"}
                onclick={() => setFormat("poll")}
              >
                Khảo sát
              </button>
            </div>
            <label>
              {form.format === "poll"
                ? "Câu hỏi"
                : form.format === "image"
                  ? "Chú thích ảnh"
                  : form.format === "video"
                    ? "Chú thích video"
                    : "Câu chữ chính"}
              <textarea
                rows="3"
                maxlength="280"
                bind:value={form.title}
                required
              ></textarea>
            </label>
            {#if form.format === "image" || form.format === "video"}
              <label>
                {form.format === "video"
                  ? "URL / đường dẫn video"
                  : "URL / đường dẫn ảnh"}
                <input
                  maxlength="500"
                  placeholder="https://… hoặc /api/media/…"
                  value={form.imageUrl}
                  oninput={(event) => {
                    const target = event.currentTarget;
                    if (!(target instanceof HTMLInputElement)) return;
                    form.imageUrl = target.value;
                    scheduleProbeMediaUrl(
                      target.value,
                      form.format === "video" ? "video" : "image"
                    );
                  }}
                />
              </label>
              <label class="file-pick">
                {form.format === "video" ? "Hoặc tải video lên" : "Hoặc tải ảnh lên"}
                <input
                  type="file"
                  accept={form.format === "video"
                    ? "video/mp4,video/webm"
                    : "image/jpeg,image/png,image/webp"}
                  disabled={mediaUploading || detailLoading || archived || saving}
                  onchange={(event) =>
                    onMediaPicked(
                      event,
                      form.format === "video" ? "video" : "image",
                      "main"
                    )}
                />
              </label>
              <label>
                {form.format === "video" ? "Mô tả video" : "Mô tả ảnh (alt)"}
                <input maxlength="200" bind:value={form.imageAlt} />
              </label>
              {#if form.format === "video"}
                <label>
                  Ảnh xem trước (tuỳ chọn)
                  <input
                    maxlength="500"
                    placeholder="https://… hoặc /api/media/…"
                    bind:value={form.posterUrl}
                  />
                </label>
                <label class="file-pick">
                  Hoặc tải ảnh xem trước
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={mediaUploading || detailLoading || archived || saving}
                    onchange={(event) =>
                      onMediaPicked(event, "image", "poster")}
                  />
                </label>
              {/if}
              {#if measuredHint}
                <p class="hint">{measuredHint}</p>
              {:else if mediaMeasuring}
                <p class="hint">Đang đo tỉ lệ media…</p>
              {:else}
                <p class="hint">
                  Tỉ lệ khung được đo tự động khi tải tệp hoặc dán URL (nếu trình
                  duyệt đọc được metadata).
                </p>
              {/if}
              <p class="hint">
                {mediaUploading
                  ? "Đang tải lên kho media…"
                  : form.format === "video"
                    ? "Video chỉ tải khi bấm phát. Có thể dán URL HTTPS hoặc tải lên R2 (tối đa 16 MB)."
                    : "Có thể dán URL HTTPS hoặc tải lên R2 (JPEG/PNG/WebP, tối đa 2 MB)."}
              </p>
            {/if}
            {#if form.format === "poll"}
              <p class="field-label">Đáp án (2–4)</p>
              <div class="poll-edit">
                {#each form.pollOptions as option, index (index)}
                  <div class="poll-edit-row">
                    <input
                      maxlength="120"
                      placeholder={`Đáp án ${index + 1}`}
                      value={option}
                      oninput={(event) => {
                        const target = event.currentTarget;
                        if (target instanceof HTMLInputElement) {
                          setPollOption(index, target.value);
                        }
                      }}
                    />
                    {#if form.pollOptions.length > 2}
                      <button
                        type="button"
                        class="chip"
                        onclick={() => removePollOption(index)}
                      >
                        Xóa
                      </button>
                    {/if}
                  </div>
                {/each}
                {#if form.pollOptions.length < 4}
                  <button
                    type="button"
                    class="chip"
                    onclick={addPollOption}
                  >
                    Thêm đáp án
                  </button>
                {/if}
              </div>
            {/if}
            <p class="field-label" id="topic-label">Chủ đề</p>
            <div class="chips" role="group" aria-labelledby="topic-label">
              {#each topicChoices as topic (topic.slug)}
                <button
                  type="button"
                  class="chip"
                  aria-pressed={form.topics.includes(topic.slug)}
                  onclick={() => toggleTopic(topic.slug)}
                >
                  {topic.label}
                </button>
              {/each}
            </div>
            <p class="hint">Chủ đề đầu tiên quyết định màu và nhóm trên thẻ.</p>
            <p class="field-label" id="mood-label">Tâm trạng phù hợp</p>
            <div class="chips" role="group" aria-labelledby="mood-label">
              {#each moodChoices as mood (mood.slug)}
                <button
                  type="button"
                  class="chip"
                  aria-pressed={form.moods.includes(mood.slug)}
                  onclick={() => toggleMood(mood.slug)}
                >
                  {mood.label}
                </button>
              {/each}
            </div>
            {#if collectionChoices.length > 0}
              <p class="field-label" id="collection-label">Bộ sưu tập</p>
              <div class="chips" role="group" aria-labelledby="collection-label">
                {#each collectionChoices as collection (collection.id)}
                  <button
                    type="button"
                    class="chip"
                    aria-pressed={form.collectionIds.includes(collection.id)}
                    onclick={() => toggleCollection(collection.id)}
                  >
                    {collection.title}
                    {#if collection.status !== "published"}
                      <span class="chip-meta">({collection.status})</span>
                    {/if}
                  </button>
                {/each}
              </div>
              <p class="hint">Có thể gắn một bài vào nhiều bộ.</p>
            {/if}
            {#if form.format === "text"}
              <label>
                Nội dung dài, Markdown
                <textarea
                  rows="6"
                  maxlength="8000"
                  bind:value={form.body}
                ></textarea>
              </label>
            {/if}
            <div class="split">
              <label>
                Nguồn
                <input maxlength="80" bind:value={form.sourceLabel} />
              </label>
              <label>
                URL nguồn
                <input
                  type="url"
                  maxlength="300"
                  placeholder="https://"
                  bind:value={form.sourceUrl}
                />
              </label>
            </div>
            {#if form.topics.length === 0}
              <p class="hint">
                Bài thiếu chủ đề sẽ nằm trong mục cần rà soát.
                Bài trùng câu chữ sẽ bị chặn khi lưu, không bị xóa.
              </p>
            {/if}
          </fieldset>

          <aside class="preview" aria-label="Xem trước thẻ">
            <p class="field-label">Xem trước</p>
            <article class="preview-card" data-theme={previewTheme}>
              <header>
                <span>{previewCategory}</span>
                <span aria-hidden="true">✦</span>
              </header>
              <div>
                <span class="mark" aria-hidden="true">“</span>
                <h3>
                  {form.title.trim() ||
                    (form.format === "image"
                      ? "Chú thích ảnh"
                      : form.format === "video"
                        ? "Chú thích video"
                        : "Câu chữ chính")}
                </h3>
              </div>
              {#if (form.format === "image" || form.format === "video") &&
                form.imageUrl.trim()}
                <p class="hint">{form.imageUrl.trim()}</p>
              {/if}
            </article>
            {#if form.body.trim()}
              <pre class="body-preview">{form.body}</pre>
            {/if}
            {#if safeUrl}
              <a href={safeUrl} target="_blank" rel="noreferrer">
                {form.sourceLabel.trim() || safeUrl}
              </a>
            {/if}
          </aside>
        </div>

        <footer class="editor-actions">
          <button
            type="submit"
            disabled={saving || detailLoading || archived}
          >
            {saving
              ? "Đang lưu…"
              : content?.status === "published"
                ? "Lưu thay đổi"
                : "Lưu bản nháp"}
          </button>
          <button
            class="primary"
            type="button"
            disabled={saving || detailLoading || archived}
            onclick={() => save(true)}
          >
            Xuất bản
          </button>
          {#if content?.status === "published"}
            <button
              type="button"
              disabled={saving || detailLoading}
              onclick={unpublish}
            >
              Gỡ xuất bản
            </button>
          {/if}
          {#if content && !archived}
            <button
              type="button"
              class="quiet"
              disabled={saving || detailLoading}
              onclick={archive}
            >
              {confirmArchive ? "Xác nhận lưu trữ" : "Lưu trữ"}
            </button>
          {/if}
        </footer>
      </form>
    </dialog>
</div>

<style>
  .desk {
    min-height: 100vh;
    color: var(--color-text);
    background: var(--color-background);
  }

  h1,
  h2,
  h3 {
    margin: 0;
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  h1 {
    font-size: var(--text-xl);
  }

  .lede,
  .page-head p,
  .hint,
  .item-description,
  .review-note {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .shell {
    display: grid;
    grid-template-columns: 232px minmax(0, 1fr);
    min-height: 100vh;
  }

  .text-button,
  .quiet {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    text-align: left;
  }

  .main {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6);
  }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .add-content {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-3);
    min-height: 48px;
    padding: var(--space-1) var(--space-5) var(--space-1) var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font-weight: 600;
  }

  .add-mark {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: 1.35rem;
    line-height: 1;
  }

  .add-content:hover {
    border-color: var(--color-primary);
    background: var(--color-theme-peace);
  }

  .add-content:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 3px;
  }

  .page-head p {
    margin-top: var(--space-2);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-3);
  }

  .stat {
    display: grid;
    gap: var(--space-1);
    min-height: 92px;
    padding: var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
  }

  .stat:nth-child(2) {
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
  }


  .stat:nth-child(3) {
    background: var(--color-theme-story);
    color: var(--color-accent-story);
  }

  .stat:nth-child(4) {
    background: var(--color-theme-psychology);
    color: var(--color-accent-psychology);
  }

  .stat.active {
    border-color: currentColor;
  }

  .stat-value {
    font-size: var(--text-xl);
    letter-spacing: -0.03em;
  }

  .stat-label {
    color: color-mix(in srgb, currentColor 70%, white);
    font-size: var(--text-sm);
  }

  .tabs,
  .toolbar,
  .pager,
  .editor-actions,
  .chips,
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .poll-edit {
    display: grid;
    gap: var(--space-2);
  }

  .poll-edit-row {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .poll-edit-row input {
    flex: 1;
  }

  .tabs button,
  .pager button,
  .editor-actions button,
  .chip {
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .tabs button[aria-selected="true"],
  .chip[aria-pressed="true"] {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .toolbar label,
  .search {
    flex: 1 1 160px;
  }

  .search {
    flex-basis: 240px;
  }

  input,
  textarea,
  select {
    width: 100%;
    margin-top: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  textarea {
    resize: vertical;
  }

  .primary {
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .primary:hover {
    background: var(--color-primary-hover);
  }

  button:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  .content-cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .content-cards > li {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 220px;
    padding: var(--space-5);
    border-radius: 1.35rem;
    background: var(--wash);
    color: var(--ink);
  }

  .content-cards > .empty {
    grid-column: 1 / -1;
    min-height: 0;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    text-align: center;
  }

  .content-top,
  .content-tools,
  .content-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .content-tools {
    flex: 0 0 auto;
  }

  .kind {
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .open-card {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    opacity: 0.55;
  }

  .open-card svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .open-card:hover,
  .open-card:focus-visible {
    opacity: 1;
  }

  .content-cards h2 {
    margin: 0;
    overflow: hidden;
    font-family: var(--font-editorial);
    font-size: clamp(1.25rem, 1.7vw, 1.6rem);
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .excerpt {
    margin: 0;
    overflow: hidden;
    color: color-mix(in srgb, var(--ink) 78%, white);
    font-size: var(--text-sm);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .review-note {
    margin: 0;
    color: var(--color-error);
    font-size: var(--text-xs);
  }

  .content-cards .status {
    background: color-mix(in srgb, var(--color-surface) 84%, transparent);
    color: var(--ink);
  }

  .content-cards .status-published {
    color: var(--color-success);
  }

  .content-meta {
    margin-top: auto;
    padding-top: var(--space-2);
    font-size: var(--text-sm);
  }

  .content-meta span {
    min-width: 0;
  }

  .content-meta time {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--ink) 70%, white);
    font-size: var(--text-xs);
  }

  .status {
    display: inline-flex;
    width: fit-content;
    padding: 0.15rem 0.55rem;
    border-radius: var(--radius-full);
    background: var(--color-surface-soft);
    font-size: var(--text-xs);
  }

  .status-published {
    color: var(--color-success);
  }

  .empty {
    color: var(--color-text-secondary);
    text-align: center;
  }

  .result-line {
    min-height: 1.5rem;
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .notice {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
  }

  .notice.error {
    background: color-mix(in srgb, var(--color-error) 12%, var(--color-surface));
    color: var(--color-error);
  }

  .notice.ok {
    background: color-mix(in srgb, var(--color-success) 12%, var(--color-surface));
    color: var(--color-success);
  }

  .editor {
    width: min(1080px, calc(100vw - 1.5rem));
    max-height: calc(100dvh - 1.5rem);
    padding: 0;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background);
    color: var(--color-text);
  }

  .editor::backdrop {
    background: color-mix(in srgb, var(--color-text) 28%, transparent);
  }

  .editor form {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .editor-head,
  .preview-card header,
  .preview-card footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  fieldset,
  .preview {
    display: grid;
    align-content: start;
    gap: var(--space-3);
  }

  .editor-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(240px, 0.85fr);
    gap: var(--space-5);
  }

  .split > label {
    flex: 1 1 180px;
  }

  .field-label {
    margin: 0;
    font-size: var(--text-sm);
  }

  .file-pick input[type="file"] {
    display: block;
    width: 100%;
    margin-top: var(--space-1);
    font-size: var(--text-sm);
  }

  .preview-card {
    display: grid;
    grid-template-rows: auto minmax(160px, 1fr) auto;
    min-height: 320px;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-theme-peace);
  }

  .preview-card[data-theme="discovery"] {
    background: var(--color-theme-discovery);
  }

  .preview-card[data-theme="story"] {
    background: var(--color-theme-story);
  }

  .preview-card[data-theme="nature"] {
    background: var(--color-theme-nature);
  }

  .preview-card[data-theme="psychology"] {
    background: var(--color-theme-psychology);
  }

  .preview-card[data-theme="cute"] {
    background: var(--color-theme-cute);
  }

  .preview-card header,
  .mark {
    color: var(--color-primary);
  }

  .preview-card h3 {
    font-family: var(--font-editorial);
    font-size: var(--text-xl);
    font-weight: 400;
    line-height: 1.35;
  }

  .mark {
    font-family: var(--font-editorial);
    font-size: var(--text-3xl);
    line-height: 0.8;
  }

  .preview-card p,
  .preview-card footer {
    color: var(--color-text-secondary);
  }

  .body-preview {
    max-height: 160px;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 900px) {
    .shell {
      grid-template-columns: 1fr;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .page-head,
    .editor-grid {
      grid-template-columns: 1fr;
      display: grid;
    }

    .page-head {
      align-items: stretch;
    }

    .add-content {
      justify-content: center;
    }
  }

  @media (max-width: 720px) {
    .content-cards {
      grid-template-columns: 1fr;
    }

    .content-cards > li {
      min-height: 0;
    }

    .toolbar label,
    .search {
      flex-basis: 100%;
    }
  }
</style>
