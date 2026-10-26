<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import AdminShell from "./AdminShell.svelte";

  import type {
    AdminCatalogItem,
    AdminContent,
    AdminListItem,
    AdminStats,
    ReviewReason
  } from "./d1-admin-content";
  import {
    contentKinds,
    isContentKind,
    isContentTheme,
    type ContentFormat,
    type ContentKind,
    type ContentStatus
  } from "../content/content.types";
  import { readContentFormat } from "../content/content-format";
  import {
    layoutLabel,
    mediaLayout,
    readFileMediaSize,
    readUrlMediaSize,
    type MediaSize
  } from "../media/media-dimensions";
  import { isCatalogSlug } from "./catalog";

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

  const formatLabels: Record<ContentFormat, string> = {
    text: "Bài viết",
    image: "Ảnh",
    video: "Video",
    poll: "Khảo sát",
    prompt: "Câu hỏi",
    quote: "Câu nói"
  };

  const statusLabels: Record<ContentStatus, string> = {
    draft: "Bản nháp",
    published: "Đã xuất bản",
    archived: "Lưu trữ"
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
    format: "text" | "image" | "video" | "poll" | "prompt" | "quote";
    topics: string[];
    moods: string[];
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
  let topicFilter = $state("");
  let sort = $state<"updated" | "created">("updated");
  let reviewOnly = $state(false);
  /** Mobile: an bo loc, bam nut moi mo. */
  let filtersOpen = $state(false);
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
  let copiedId = $state("");
  let copyFlash = $state("");
  let copyTimer = 0;
  let detailLoading = $state(false);
  let saving = $state(false);
  let mediaUploading = $state(false);
  let mediaMeasuring = $state(false);
  let confirmArchive = $state(false);
  let deleteTarget = $state<AdminListItem | null>(null);
  let deleteDialog = $state<HTMLDialogElement | null>(null);
  let deleting = $state(false);
  let deleteError = $state("");
  let sizeProbeTicket = 0;
  let sizeProbeTimer: ReturnType<typeof setTimeout> | undefined;
  let content = $state<AdminContent | null>(null);
  let form = $state(emptyForm());
  let savedForm = $state(formSnapshot(emptyForm()));
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(
    null
  );
  let editor = $state<HTMLDialogElement | null>(null);
  let storyImageInput = $state<HTMLInputElement | null>(null);
  let storyUrlOpen = $state(false);

  let listTicket = 0;
  let detailTicket = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  let topicChoices = $derived(topics);
  let moodChoices = $derived(moods);
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
      format: readContentFormat(row.format),
      kind,
      theme,
      status,
      topics: row.topics.filter(
        (topic): topic is string =>
          typeof topic === "string" && isCatalogSlug(topic)
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
        (mood): mood is string =>
          typeof mood === "string" && isCatalogSlug(mood)
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
        if (form.format === "text" || form.format === "image") {
          form.format = "image";
        }
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
      next.format === "video" ||
      next.format === "prompt" ||
      next.format === "quote"
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
    if (next !== "" && !isCatalogSlug(next)) {
      return;
    }
    topicFilter = next;
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
          form.format === "poll" || form.format === "prompt"
            ? "Hãy nhập câu hỏi và chọn ít nhất một chủ đề."
            : form.format === "quote"
              ? "Hãy nhập câu nói và chọn ít nhất một chủ đề."
              : form.format === "video"
                ? "Hãy nhập chú thích video và chọn ít nhất một chủ đề."
                : "Hãy nhập câu chữ chính và chọn ít nhất một chủ đề."
      };
      return;
    }

    if (form.format === "quote" && !form.sourceLabel.trim()) {
      notice = {
        tone: "error",
        text: "Hãy nhập tên tác giả hoặc nguồn dân gian."
      };
      return;
    }

    if (form.format === "video" && !form.imageUrl.trim()) {
      notice = {
        tone: "error",
        text: "Hãy dán URL video hoặc tải tệp lên."
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
            format:
              form.format === "video" ||
              form.format === "poll" ||
              form.format === "prompt" ||
              form.format === "quote"
                ? form.format
                : form.imageUrl.trim()
                  ? "image"
                  : "text",
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

  function askDelete(item: AdminListItem, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    deleteError = "";
    deleteTarget = item;
    deleteDialog?.showModal();
  }

  async function copyContentId(item: AdminListItem, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(item.id);
      copiedId = item.id;
      copyFlash = `Đã copy mã bài: ${item.id}`;
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        if (copiedId === item.id) copiedId = "";
        copyFlash = "";
      }, 1800);
    } catch {
      copyFlash = "Không copy được mã bài.";
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copyFlash = "";
      }, 2200);
    }
  }

  function cancelDelete() {
    if (deleting) return;
    deleteDialog?.close();
    deleteTarget = null;
    deleteError = "";
  }

  async function confirmDelete() {
    const target = deleteTarget;
    if (!target || deleting) return;

    deleting = true;
    deleteError = "";

    try {
      const { response, body } = await requestJson(
        `/api/admin/contents/${target.id}`,
        { method: "DELETE" }
      );

      if (response.status === 401) {
        loseAccess();
        return;
      }

      if (!response.ok) {
        deleteError = errorText(body, "Không xóa được bài.");
        return;
      }

      items = items.filter((item) => item.id !== target.id);
      total = Math.max(0, total - 1);
      stats = {
        ...stats,
        total: Math.max(0, stats.total - 1),
        published:
          target.status === "published"
            ? Math.max(0, stats.published - 1)
            : stats.published,
        drafts:
          target.status === "draft"
            ? Math.max(0, stats.drafts - 1)
            : stats.drafts,
        review:
          target.reviewReasons.length > 0
            ? Math.max(0, stats.review - 1)
            : stats.review
      };

      if (content?.id === target.id) {
        confirmArchive = false;
        content = null;
        form = emptyForm();
        remember();
        editor?.close();
      }

      deleteDialog?.close();
      deleteTarget = null;
    } catch {
      deleteError = "Không có kết nối.";
    } finally {
      deleting = false;
    }
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

  function toggleTopic(slug: string) {
    form.topics = form.topics.includes(slug)
      ? form.topics.filter((item) => item !== slug)
      : [...form.topics, slug];
  }

  function toggleMood(slug: string) {
    form.moods = form.moods.includes(slug)
      ? form.moods.filter((item) => item !== slug)
      : [...form.moods, slug];
  }

  /** Chữ + ảnh cùng một loại biên tập. */
  const isStory = $derived(
    form.format === "text" || form.format === "image"
  );

  function clearStoryImage() {
    form.imageUrl = "";
    form.imageAlt = "";
    form.format = "text";
    clearMeasuredSize();
    storyUrlOpen = false;
  }

  function onStoryImageDrop(event: DragEvent) {
    event.preventDefault();
    if (mediaUploading || detailLoading || archived || saving) return;
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    void uploadMediaFile(file, "image", "main");
  }

  function setFormat(next: "text" | "video" | "poll" | "prompt" | "quote") {
    if (next === "text") {
      if (
        form.format === "video" ||
        form.format === "prompt" ||
        form.format === "quote"
      ) {
        form.imageUrl = "";
        form.imageAlt = "";
        form.posterUrl = "";
        clearMeasuredSize();
      }
      form.format = form.imageUrl.trim() ? "image" : "text";
      return;
    }

    if (next === "video") {
      if (form.format !== "video") {
        form.imageUrl = "";
        form.imageAlt = "";
        form.posterUrl = "";
        clearMeasuredSize();
      }
      form.format = "video";
      return;
    }

    if (next === "prompt" || next === "quote") {
      form.imageUrl = "";
      form.imageAlt = "";
      form.posterUrl = "";
      clearMeasuredSize();
      form.format = next;
      return;
    }

    form.format = "poll";
    if (form.pollOptions.length < 2) form.pollOptions = ["", ""];
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

<AdminShell current="contents" onleave={leave} {pending}>
      <main class="main">
        <header class="page-head">
          <div>
            <h1>Quản lý nội dung</h1>
            <p>
              Mỗi bài là một thẻ. Bấm mũi tên để mở và sửa. Danh sách tải từng trang.
            </p>
          </div>
          <button class="add-btn" type="button" onclick={startNew}>
            + Thêm nội dung
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
          <button
            type="button"
            class="filter-toggle"
            class:is-active={kindFilter !== "" ||
              topicFilter !== "" ||
              sort !== "updated"}
            aria-expanded={filtersOpen}
            aria-controls="content-filters"
            onclick={() => (filtersOpen = !filtersOpen)}
          >
            {filtersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
          </button>
          <div
            id="content-filters"
            class="filter-fields"
            class:is-open={filtersOpen}
          >
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
        {#if copyFlash}
          <p class="copy-flash" role="status">{copyFlash}</p>
        {/if}
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
              <li>
                <div class="content-top">
                  <span class="kind">{formatLabels[item.format]}</span>
                  <span class="status status-{item.status}">
                    {statusLabels[item.status]}
                  </span>
                </div>
                <h2>{item.title}</h2>
                {#if item.description}
                  <p class="excerpt">{item.description}</p>
                {/if}
                <div class="content-meta">
                  <span class:topic-missing={item.topics.length === 0}>
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
                    {dateLabel(
                      sort === "created" ? item.createdAt : item.updatedAt
                    )}
                  </time>
                </div>
                <div class="content-tools" role="group" aria-label="Công cụ bài">
                  {#if item.status === "published"}
                    <a
                      class="view-card"
                      href={`/?v=${encodeURIComponent(item.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Xem ${item.title} trên trang chủ`}
                      title="Xem trên trang chủ"
                      onclick={(event) => event.stopPropagation()}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                        />
                      </svg>
                    </a>
                  {/if}
                  <button
                    type="button"
                    class="copy-card"
                    class:is-copied={copiedId === item.id}
                    aria-label={`Copy mã bài ${item.title}`}
                    title={copiedId === item.id ? "Đã copy" : "Copy mã bài"}
                    onclick={(event) => void copyContentId(item, event)}
                  >
                    {#if copiedId === item.id}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                        />
                      </svg>
                    {/if}
                  </button>
                  <button
                    type="button"
                    class="delete-card"
                    aria-label={`Xóa ${item.title}`}
                    onclick={(event) => askDelete(item, event)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    class="open-card"
                    aria-label={`Chỉnh sửa ${item.title}`}
                    onclick={() => openItem(item)}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                      />
                    </svg>
                  </button>
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
</AdminShell>

    <dialog
      class="editor"
      bind:this={editor}
      aria-labelledby="editor-title"
      oncancel={onDialogCancel}
    >
      <form
        class="editor-form"
        onsubmit={(event) => {
          event.preventDefault();
          void save(false);
        }}
      >
        <header class="editor-head">
          <div class="editor-head-copy">
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
            class="text-button editor-close"
            onclick={requestClose}
          >
            Đóng
          </button>
        </header>

        {#if notice}
          <p
            class="notice editor-notice"
            class:error={notice.tone === "error"}
            class:ok={notice.tone === "ok"}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        {/if}

        <div class="editor-body">
          <fieldset
            class="compose-pane"
            disabled={detailLoading || archived || saving}
          >
            <p class="field-label" id="format-label">Định dạng</p>
            <div class="chips" role="group" aria-labelledby="format-label">
              <button
                type="button"
                class="chip"
                aria-pressed={isStory}
                onclick={() => setFormat("text")}
              >
                Bài viết
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "quote"}
                onclick={() => setFormat("quote")}
              >
                Câu nói
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
              <button
                type="button"
                class="chip"
                aria-pressed={form.format === "prompt"}
                onclick={() => setFormat("prompt")}
              >
                Câu hỏi
              </button>
            </div>
            <label>
              {form.format === "poll" || form.format === "prompt"
                ? "Câu hỏi"
                : form.format === "quote"
                  ? "Câu nói"
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
            {#if form.format === "quote"}
              <label>
                Tác giả / nguồn dân gian
                <input
                  maxlength="80"
                  placeholder="Ví dụ: Nguyễn Du, tục ngữ Việt Nam…"
                  bind:value={form.sourceLabel}
                  required
                />
              </label>
              <p class="hint">
                Ghi tên người nổi tiếng, hoặc nguồn dân gian nếu là tục ngữ / ca dao.
              </p>
            {/if}
            {#if form.format === "prompt"}
              <p class="hint">
                Người đọc chỉ nghĩ riêng — không chọn đáp án, không hiện phần trăm.
              </p>
            {/if}
            {#if isStory}
              <div class="media-pane">
                <p class="field-label">Ảnh minh họa</p>
                <button
                  type="button"
                  class="media-drop"
                  class:has-image={!!form.imageUrl.trim()}
                  class:is-busy={mediaUploading}
                  disabled={mediaUploading || detailLoading || archived || saving}
                  onclick={() => storyImageInput?.click()}
                  ondragover={(event) => event.preventDefault()}
                  ondrop={onStoryImageDrop}
                >
                  {#if form.imageUrl.trim()}
                    <img
                      src={form.imageUrl.trim()}
                      alt={form.imageAlt || form.title || "Ảnh bài viết"}
                    />
                    <span class="media-drop-badge">
                      {mediaUploading ? "Đang tải…" : "Đổi ảnh"}
                    </span>
                  {:else}
                    <span class="media-drop-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M4.5 15.75 9 11.25l3.75 3.75L18 9.75l1.5 1.5"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                        <path
                          d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h12a2.25 2.25 0 0 1 2.25 2.25v10.5A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
                          stroke="currentColor"
                          stroke-width="1.5"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </span>
                    <strong>
                      {mediaUploading ? "Đang tải lên…" : "Kéo thả hoặc chọn ảnh"}
                    </strong>
                    <span>JPEG, PNG, WebP · tối đa 2 MB · tuỳ chọn</span>
                  {/if}
                </button>
                <input
                  bind:this={storyImageInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  disabled={mediaUploading || detailLoading || archived || saving}
                  onchange={(event) => onMediaPicked(event, "image", "main")}
                />

                {#if form.imageUrl.trim()}
                  <div class="media-toolbar">
                    <button
                      type="button"
                      class="chip"
                      disabled={mediaUploading || detailLoading || archived || saving}
                      onclick={() => storyImageInput?.click()}
                    >
                      Đổi ảnh
                    </button>
                    <button
                      type="button"
                      class="chip"
                      disabled={mediaUploading || detailLoading || archived || saving}
                      onclick={clearStoryImage}
                    >
                      Gỡ ảnh
                    </button>
                    {#if measuredHint}
                      <span class="media-meta">{measuredHint}</span>
                    {:else if mediaMeasuring}
                      <span class="media-meta">Đang đo tỉ lệ…</span>
                    {/if}
                  </div>
                  <label>
                    Mô tả ảnh (alt)
                    <input
                      maxlength="200"
                      placeholder="Mô tả ngắn cho ảnh"
                      bind:value={form.imageAlt}
                    />
                  </label>
                {/if}

                <div class="media-url">
                  <button
                    type="button"
                    class="media-url-toggle"
                    aria-expanded={storyUrlOpen}
                    onclick={() => (storyUrlOpen = !storyUrlOpen)}
                  >
                    {storyUrlOpen ? "Ẩn dán URL" : "Hoặc dán URL ảnh"}
                  </button>
                  {#if storyUrlOpen}
                    <input
                      maxlength="500"
                      placeholder="https://… hoặc /api/media/…"
                      value={form.imageUrl}
                      disabled={mediaUploading || detailLoading || archived || saving}
                      oninput={(event) => {
                        const target = event.currentTarget;
                        if (!(target instanceof HTMLInputElement)) return;
                        form.imageUrl = target.value;
                        form.format = target.value.trim() ? "image" : "text";
                        scheduleProbeMediaUrl(target.value, "image");
                      }}
                    />
                  {/if}
                </div>
              </div>
            {:else if form.format === "video"}
              <label>
                URL / đường dẫn video
                <input
                  maxlength="500"
                  placeholder="https://… hoặc /api/media/…"
                  value={form.imageUrl}
                  oninput={(event) => {
                    const target = event.currentTarget;
                    if (!(target instanceof HTMLInputElement)) return;
                    form.imageUrl = target.value;
                    scheduleProbeMediaUrl(target.value, "video");
                  }}
                />
              </label>
              <label class="file-pick">
                Hoặc tải video lên
                <input
                  type="file"
                  accept="video/mp4,video/webm"
                  disabled={mediaUploading || detailLoading || archived || saving}
                  onchange={(event) => onMediaPicked(event, "video", "main")}
                />
              </label>
              <label>
                Mô tả video
                <input maxlength="200" bind:value={form.imageAlt} />
              </label>
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
              {#if measuredHint}
                <p class="hint">{measuredHint}</p>
              {:else if mediaMeasuring}
                <p class="hint">Đang đo tỉ lệ media…</p>
              {:else}
                <p class="hint">
                  Tỉ lệ khung được đo tự động khi tải tệp hoặc dán URL.
                </p>
              {/if}
              <p class="hint">
                {mediaUploading
                  ? "Đang tải lên kho media…"
                  : "Video chỉ tải khi bấm phát. HTTPS hoặc R2 (tối đa 16 MB)."}
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
            {#if isStory || form.format === "video" || form.format === "prompt"}
              <label>
                {form.format === "prompt"
                  ? "Gợi ý thêm (Markdown, tùy chọn)"
                  : "Nội dung bài viết (Markdown, tùy chọn)"}
                <textarea
                  rows="6"
                  maxlength="8000"
                  placeholder={form.format === "prompt"
                    ? "Vài dòng để người đọc nghĩ sâu hơn…"
                    : "Viết thêm để hiện nút Đọc thêm trên thẻ…"}
                  bind:value={form.body}
                ></textarea>
              </label>
            {/if}
            {#if form.format !== "quote"}
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
            {:else}
              <label>
                URL nguồn (tùy chọn)
                <input
                  type="url"
                  maxlength="300"
                  placeholder="https://"
                  bind:value={form.sourceUrl}
                />
              </label>
            {/if}
            {#if form.topics.length === 0}
              <p class="hint">
                Bài thiếu chủ đề sẽ nằm trong mục cần rà soát.
                Bài trùng câu chữ sẽ bị chặn khi lưu, không bị xóa.
              </p>
            {/if}
          </fieldset>
        </div>

        <footer class="editor-actions">
          <div class="editor-actions-main">
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
          </div>
          <div class="editor-actions-more">
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
          </div>
        </footer>
      </form>
    </dialog>

    <dialog
      class="delete-confirm"
      bind:this={deleteDialog}
      aria-labelledby="delete-title"
      oncancel={(event) => {
        if (deleting) {
          event.preventDefault();
          return;
        }
        deleteTarget = null;
        deleteError = "";
      }}
    >
      <form
        method="dialog"
        class="delete-confirm-form"
        onsubmit={(event) => {
          event.preventDefault();
          void confirmDelete();
        }}
      >
        <h2 id="delete-title">Xóa nội dung?</h2>
        <p>
          {#if deleteTarget}
            «{deleteTarget.title}» sẽ bị xóa vĩnh viễn khỏi hệ thống, không thể hoàn tác.
          {:else}
            Bài này sẽ bị xóa vĩnh viễn khỏi hệ thống, không thể hoàn tác.
          {/if}
        </p>
        {#if deleteError}
          <p class="notice error" role="alert">{deleteError}</p>
        {/if}
        <div class="delete-confirm-actions">
          <button
            type="button"
            class="quiet"
            disabled={deleting}
            onclick={cancelDelete}
          >
            Hủy
          </button>
          <button type="submit" class="danger" disabled={deleting}>
            {deleting ? "Đang xóa…" : "Xóa"}
          </button>
        </div>
      </form>
    </dialog>

<style>
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
  .item-description {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
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
    gap: var(--space-5);
    min-width: 0;
    padding: var(--space-6);
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .page-head > div {
    min-width: 0;
    flex: 1 1 auto;
  }

  .add-btn {
    flex: 0 0 auto;
    min-height: 36px;
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 650;
    cursor: pointer;
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
    align-content: center;
    min-height: 92px;
    padding: var(--space-4);
    border: 1px solid transparent;
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
    text-align: left;
    cursor: pointer;
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
  .chips,
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter-toggle {
    display: none;
  }

  .filter-fields {
    display: contents;
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--space-2);
    margin: 0 calc(-1 * var(--space-5)) calc(-1 * var(--space-5));
    padding: var(--space-4) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: color-mix(in oklab, var(--color-surface) 94%, transparent);
    backdrop-filter: blur(8px);
  }

  .editor-actions-main,
  .editor-actions-more {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .editor-actions-more {
    margin-left: auto;
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
  .editor-actions button:not(.quiet),
  .chip {
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
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

  /* Loc: mui ten dropdown dich vao trong, khong sat mep phai. */
  .toolbar select {
    appearance: none;
    padding-inline-end: 2.25rem;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239aa39a' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19 9-7 7-7-7'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.85rem center;
    background-size: 1rem;
  }

  :global(html[data-theme="dark"]) .toolbar select {
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23c5cec5' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='m19 9-7 7-7-7'/%3E%3C/svg%3E");
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "top tools"
      "title title"
      "excerpt excerpt"
      "meta meta";
    gap: var(--space-3);
    align-content: start;
    min-height: 220px;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: 1.35rem;
    background: var(--color-surface);
    color: var(--color-text);
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
    gap: var(--space-2);
  }

  .content-top {
    grid-area: top;
    min-width: 0;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
  }

  .content-tools {
    grid-area: tools;
    justify-self: end;
    align-self: start;
    justify-content: flex-end;
  }

  .content-cards > li > h2 {
    grid-area: title;
  }

  .content-cards > li > .excerpt {
    grid-area: excerpt;
  }

  .content-meta {
    grid-area: meta;
    justify-content: space-between;
  }

  .kind {
    font-size: var(--text-xs);
    font-weight: 650;
    letter-spacing: 0.01em;
  }

  .open-card,
  .delete-card,
  .view-card,
  .copy-card {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    opacity: 0.75;
    text-decoration: none;
    cursor: pointer;
  }

  .open-card svg,
  .delete-card svg,
  .view-card svg,
  .copy-card svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .open-card:hover,
  .open-card:focus-visible,
  .delete-card:hover,
  .delete-card:focus-visible,
  .view-card:hover,
  .view-card:focus-visible,
  .copy-card:hover,
  .copy-card:focus-visible {
    opacity: 1;
  }

  .view-card:hover,
  .view-card:focus-visible,
  .copy-card:hover,
  .copy-card:focus-visible,
  .copy-card.is-copied {
    color: var(--color-primary);
    opacity: 1;
  }

  .delete-card:hover,
  .delete-card:focus-visible {
    color: #c45b5b;
  }

  .delete-confirm {
    width: min(100% - 2rem, 22rem);
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: 1.1rem;
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 18px 48px color-mix(in oklab, #000 28%, transparent);
  }

  .delete-confirm::backdrop {
    background: color-mix(in oklab, #000 42%, transparent);
  }

  .delete-confirm-form {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .delete-confirm-form p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .delete-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .delete-confirm .danger {
    border: 0;
    border-radius: var(--radius-full);
    background: #c45b5b;
    color: #fff;
  }

  .delete-confirm .danger:hover {
    background: #b04e4e;
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
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .content-cards .status {
    background: var(--color-surface-soft);
    color: var(--color-text-secondary);
  }

  .content-cards .status-published {
    color: var(--color-success);
  }

  .content-meta {
    margin-top: auto;
    padding-top: var(--space-2);
    font-size: var(--text-sm);
  }

  .content-meta span.topic-missing {
    color: #d4b44a;
    font-weight: 600;
  }

  .content-meta span {
    min-width: 0;
  }

  .content-meta time {
    flex: 0 0 auto;
    color: var(--color-text-secondary);
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

  .copy-flash {
    margin: 0;
    color: var(--color-primary);
    font-size: var(--text-sm);
    font-weight: 600;
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

  /*
   * Cỡ modal cố định theo viewport — không co theo độ dài bài.
   * Chừa ~0.75rem mỗi cạnh; form + body flex chiếm hết phần còn lại.
   */
  .editor {
    --editor-inset: 1.5rem;
    --editor-width: min(720px, calc(100vw - var(--editor-inset)));
    --editor-height: calc(100dvh - var(--editor-inset));
    width: var(--editor-width);
    height: var(--editor-height);
    max-height: var(--editor-height);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background);
    color: var(--color-text);
  }

  /* Scrim tối cố định — tránh dùng --color-text (sáng ở dark mode → backdrop bị sáng). */
  .editor::backdrop {
    background: color-mix(in oklab, #0a100c 52%, transparent);
    backdrop-filter: blur(5px);
  }

  :global(html[data-theme="dark"]) .editor::backdrop {
    background: color-mix(in oklab, #020403 78%, transparent);
  }

  .editor-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
    height: 100%;
    max-height: 100%;
    min-height: 0;
    padding: var(--space-5);
    overflow: hidden;
  }

  .editor-head {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .editor-head-copy {
    min-width: 0;
  }

  .editor-close {
    flex: 0 0 auto;
    min-height: 2.5rem;
    padding: 0.35rem 0.5rem;
    font-weight: 600;
    cursor: pointer;
  }

  .editor-body {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    /* Kéo sát mép ngoài modal; nội dung vẫn cách lề bằng padding phải. */
    margin-inline-end: calc(-1 * var(--space-5));
    padding-inline-end: var(--space-5);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--color-text) 28%, transparent)
      transparent;
  }

  .editor-body::-webkit-scrollbar {
    width: 5px;
  }

  .editor-body::-webkit-scrollbar-track {
    margin-block: 0.4rem;
    background: transparent;
  }

  .editor-body::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-text) 28%, transparent);
  }

  .editor-body::-webkit-scrollbar-thumb:hover {
    background: color-mix(in oklab, var(--color-text) 45%, transparent);
  }

  .editor-notice {
    flex: 0 0 auto;
    margin: 0;
  }

  fieldset {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  fieldset {
    display: grid;
    align-content: start;
    gap: var(--space-3);
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

  .media-pane {
    display: grid;
    gap: 0.65rem;
  }

  .media-drop {
    position: relative;
    display: grid;
    place-items: center;
    gap: 0.4rem;
    width: 100%;
    min-height: 168px;
    padding: 1.15rem 1rem;
    overflow: hidden;
    border: 1px dashed color-mix(in oklab, var(--color-border) 85%, var(--color-primary));
    border-radius: calc(var(--radius-lg) + 2px);
    background:
      linear-gradient(
        155deg,
        color-mix(in oklab, var(--color-primary) 9%, transparent),
        transparent 52%
      ),
      color-mix(in oklab, var(--color-surface-soft) 72%, transparent);
    color: var(--color-text-secondary);
    text-align: center;
    cursor: pointer;
    transition:
      border-color 160ms ease,
      transform 160ms ease,
      background 160ms ease,
      filter 160ms ease;
  }

  .media-drop:hover:not(:disabled) {
    border-color: color-mix(in oklab, var(--color-primary) 55%, transparent);
    filter: brightness(1.03);
    transform: translateY(-1px);
  }

  .media-drop:disabled,
  .media-drop.is-busy {
    cursor: progress;
    opacity: 0.85;
  }

  .media-drop.has-image {
    min-height: 200px;
    padding: 0;
    border-style: solid;
    border-color: var(--color-border);
  }

  .media-drop img {
    display: block;
    width: 100%;
    height: 200px;
    object-fit: cover;
  }

  .media-drop-icon {
    display: grid;
    place-items: center;
    width: 2.6rem;
    height: 2.6rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 70%, transparent);
    color: var(--color-primary);
  }

  .media-drop-icon svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .media-drop strong {
    color: var(--color-text);
    font-size: 0.95rem;
    font-weight: 650;
  }

  .media-drop > span:not(.media-drop-icon):not(.media-drop-badge) {
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .media-drop-badge {
    position: absolute;
    right: 10px;
    bottom: 10px;
    padding: 0.28rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 88%, transparent);
    color: var(--color-text);
    font-size: 0.75rem;
    font-weight: 650;
    backdrop-filter: blur(6px);
  }

  .media-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
  }

  .media-meta {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: 0.78rem;
  }

  .media-url {
    display: grid;
    gap: 0.4rem;
  }

  .media-url-toggle {
    justify-self: start;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }

  .media-url input {
    width: 100%;
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

  @media (max-width: 1023px) {
    .main {
      gap: var(--space-4);
      padding: var(--space-4);
    }

    .page-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    .page-head p {
      max-width: 40rem;
    }

    .add-btn {
      justify-self: stretch;
      min-height: 2.75rem;
      width: 100%;
    }

    .stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .stat {
      min-height: 76px;
      padding: var(--space-3);
    }

    .stat-value {
      font-size: var(--text-lg);
    }

    .content-cards {
      gap: var(--space-3);
    }

    .content-cards > li {
      min-height: 0;
      padding: var(--space-4);
      border-radius: 1.1rem;
    }

    .content-cards h2 {
      font-size: clamp(1.15rem, 3.2vw, 1.4rem);
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .open-card,
    .delete-card,
    .view-card,
    .copy-card {
      width: 44px;
      height: 44px;
    }

    .open-card svg,
    .delete-card svg,
    .view-card svg,
    .copy-card svg {
      width: 20px;
      height: 20px;
    }

    /* —— Editor: full sheet —— */
    .editor {
      --editor-inset: 0px;
      --editor-width: 100vw;
      --editor-height: 100dvh;
      width: var(--editor-width);
      max-width: 100vw;
      height: var(--editor-height);
      max-height: var(--editor-height);
      margin: 0;
      overflow: hidden;
      border: 0;
      border-radius: 0;
    }

    .editor-form {
      display: flex;
      flex-direction: column;
      gap: 0;
      width: 100%;
      height: 100%;
      max-height: 100%;
      padding: 0;
      padding-top: env(safe-area-inset-top);
      overflow: hidden;
    }

    .editor-head {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    .editor-head h2 {
      font-size: 1.1rem;
    }

    .editor-notice {
      margin: var(--space-3) var(--space-4) 0;
    }

    .editor-body {
      min-height: 0;
      margin-inline-end: 0;
      overflow: auto;
      overscroll-behavior: contain;
      padding: var(--space-4);
      padding-inline-end: calc(var(--space-4) - 2px);
      padding-bottom: var(--space-3);
    }

    .editor-actions {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
      background: color-mix(in oklab, var(--color-surface) 92%, transparent);
    }

    .editor-actions-main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
      width: 100%;
    }

    .editor-actions-main > button {
      width: 100%;
      min-height: 2.75rem;
    }

    .editor-actions-more {
      margin-left: 0;
      justify-content: center;
      gap: var(--space-3);
    }

    .editor-actions-more:empty {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .main {
      gap: var(--space-3);
      padding: var(--space-3);
    }

    h1 {
      font-size: 1.25rem;
    }

    .page-head p {
      font-size: 0.82rem;
      line-height: 1.4;
    }

    .stats {
      gap: 0.5rem;
    }

    .stat {
      min-height: 68px;
      padding: 0.7rem 0.75rem;
      border-radius: var(--radius-md);
    }

    .stat-label {
      font-size: 0.75rem;
    }

    .tabs {
      gap: 0.35rem;
    }

    .tabs button {
      min-height: 2.25rem;
      padding: 0 0.7rem;
      font-size: 0.85rem;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-2);
      align-items: center;
    }

    .search {
      grid-column: 1;
      flex: none;
      width: auto;
      min-width: 0;
    }

    .search input {
      box-sizing: border-box;
      height: 2.5rem;
      margin-top: 0;
      padding: 0 0.75rem;
      font-size: 0.85rem;
    }

    .filter-toggle {
      display: inline-flex;
      grid-column: 2;
      box-sizing: border-box;
      align-items: center;
      justify-content: center;
      height: 2.5rem;
      min-height: 2.5rem;
      padding: 0 0.85rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      background: var(--color-surface);
      color: var(--color-text);
      font: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
    }

    .filter-toggle.is-active {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .filter-fields {
      display: none;
      grid-column: 1 / -1;
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .filter-fields.is-open {
      display: grid;
    }

    .filter-fields label {
      width: 100%;
    }

    .content-cards {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .content-cards > li {
      grid-template-columns: 1fr;
      grid-template-areas:
        "top"
        "title"
        "excerpt"
        "meta"
        "tools";
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-radius: 1rem;
    }

    .content-tools {
      width: 100%;
      justify-content: flex-end;
      gap: 0.1rem;
      margin-top: 0.15rem;
      padding-top: 0.45rem;
      border-top: 1px solid color-mix(in oklab, var(--color-border) 80%, transparent);
    }

    .open-card,
    .delete-card,
    .view-card,
    .copy-card {
      width: 2rem;
      height: 2rem;
    }

    .open-card svg,
    .delete-card svg,
    .view-card svg,
    .copy-card svg {
      width: 1rem;
      height: 1rem;
    }

    .excerpt {
      -webkit-line-clamp: 2;
      line-clamp: 2;
    }

    .pager {
      justify-content: stretch;
    }

    .pager button {
      flex: 1 1 0;
      min-height: 2.75rem;
    }

    .split {
      display: grid;
      grid-template-columns: 1fr;
    }

    .split > label {
      flex: none;
    }
  }

  @media (min-width: 768px) and (max-width: 1023px) {
    .content-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
    }

    .filter-toggle {
      display: none;
    }

    .filter-fields {
      display: contents;
    }

    .toolbar label,
    .search {
      flex: none;
      min-width: 0;
    }
  }
</style>
