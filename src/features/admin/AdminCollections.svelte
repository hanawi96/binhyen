<script lang="ts">
  import type {
    CollectionDetail,
    CollectionStatus,
    CollectionSummary
  } from "../collections/d1-collections";
  import { slugFromTitle } from "../collections/d1-collections";
  import AdminShell from "./AdminShell.svelte";

  interface Props {
    initialCollections: CollectionSummary[];
    pending: number;
  }

  interface SearchHit {
    id: string;
    title: string;
    status: string;
    kind: string;
  }

  type View = "grid" | "detail";

  let { initialCollections, pending }: Props = $props();

  let collections = $state(initialCollections.map((item) => ({ ...item })));
  let view = $state<View>("grid");
  let detail = $state<CollectionDetail | null>(null);

  let title = $state("");
  let slug = $state("");
  let description = $state("");
  let coverUrl = $state("");
  let coverAlt = $state("");
  let status = $state<CollectionStatus>("draft");
  let sortOrder = $state(0);
  let slugTouched = $state(false);
  let coverUploading = $state(false);
  let createCoverInput = $state<HTMLInputElement | null>(null);

  let busy = $state(false);
  let itemsSaving = $state(false);
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(null);

  let persistChain: Promise<void> = Promise.resolve();
  let pendingItemIds: string[] | null = null;
  let persistInFlight = 0;

  /** Modal tao bo moi */
  let createOpen = $state(false);
  let createDialog = $state<HTMLDialogElement | null>(null);
  let createNotice = $state<{ tone: "ok" | "error"; text: string } | null>(
    null
  );

  /** Modal them bai */
  let addOpen = $state(false);
  let addTarget = $state<CollectionSummary | null>(null);
  let addDetail = $state<CollectionDetail | null>(null);
  let addQuery = $state("");
  let addHits = $state<SearchHit[]>([]);
  let addSearching = $state(false);
  let addBusy = $state(false);
  let addNotice = $state("");
  let addManualId = $state("");
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let addDialog = $state<HTMLDialogElement | null>(null);

  async function leave() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.replace("/admin/login");
    }
  }

  function statusLabel(value: CollectionStatus): string {
    if (value === "published") return "Xuất bản";
    if (value === "archived") return "Lưu trữ";
    return "Nháp";
  }

  function formatLabel(format: string): string {
    if (format === "image") return "Ảnh";
    if (format === "video") return "Video";
    if (format === "poll") return "Khảo sát";
    if (format === "prompt") return "Câu hỏi";
    if (format === "quote") return "Câu nói";
    return "Chữ";
  }

  function upsertList(row: CollectionSummary) {
    const next = collections.filter((item) => item.id !== row.id);
    next.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      coverUrl: row.coverUrl ?? "",
      coverAlt: row.coverAlt ?? "",
      status: row.status,
      sortOrder: row.sortOrder,
      itemCount: row.itemCount,
      publishedCount: row.publishedCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt
    });
    next.sort(
      (a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt
    );
    collections = next;
  }

  function goGrid() {
    view = "grid";
    detail = null;
    notice = null;
  }

  function resetMetaForm() {
    title = "";
    slug = "";
    description = "";
    coverUrl = "";
    coverAlt = "";
    status = "draft";
    sortOrder = collections.length;
    slugTouched = false;
  }

  let metaMode = $state<"create" | "edit">("create");

  function fillMetaFromDetail(row: CollectionDetail) {
    title = row.title;
    slug = row.slug;
    description = row.description;
    coverUrl = row.coverUrl ?? "";
    coverAlt = row.coverAlt ?? "";
    status = row.status;
    sortOrder = row.sortOrder;
    slugTouched = true;
  }

  function startCreate() {
    if (busy || createOpen) return;
    metaMode = "create";
    resetMetaForm();
    createNotice = null;
    notice = null;
    createOpen = true;
    queueMicrotask(() => createDialog?.showModal());
  }

  function startEditMeta() {
    if (!detail || busy || createOpen) return;
    metaMode = "edit";
    fillMetaFromDetail(detail);
    createNotice = null;
    notice = null;
    createOpen = true;
    queueMicrotask(() => createDialog?.showModal());
  }

  function closeCreateModal() {
    createDialog?.close();
    createOpen = false;
    createNotice = null;
    if (metaMode === "edit" && detail) {
      fillMetaFromDetail(detail);
    }
  }

  function onTitleInput() {
    if (!slugTouched) slug = slugFromTitle(title || "bo");
  }

  function flashNotice(tone: "ok" | "error", text: string) {
    if (createOpen) createNotice = { tone, text };
    else notice = { tone, text };
  }

  async function uploadCover(file: File) {
    if (coverUploading || busy) return;
    coverUploading = true;
    if (createOpen) createNotice = null;
    else notice = null;
    try {
      const payload = new FormData();
      payload.append("file", file);
      payload.append("kind", "image");
      const response = await fetch("/api/admin/media", {
        method: "POST",
        body: payload
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success || typeof body.url !== "string") {
        flashNotice("error", body?.error ?? "Không tải được ảnh bìa.");
        return;
      }
      coverUrl = body.url;
      if (!coverAlt.trim()) coverAlt = title.trim() || "Ảnh bìa bộ sưu tập";
      flashNotice("ok", "Đã tải ảnh bìa lên kho media.");
    } catch {
      flashNotice("error", "Không có kết nối khi tải ảnh.");
    } finally {
      coverUploading = false;
    }
  }

  function onCoverPicked(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    const file = input.files[0];
    input.value = "";
    void uploadCover(file);
  }

  function clearCover() {
    coverUrl = "";
    coverAlt = "";
  }

  async function fetchCollection(id: string): Promise<CollectionDetail | null> {
    const response = await fetch(
      `/api/admin/collections/${encodeURIComponent(id)}`
    );
    const body = await response.json();
    if (!response.ok || !body?.success || !body.collection) return null;
    return body.collection as CollectionDetail;
  }

  async function openDetail(id: string) {
    busy = true;
    notice = null;
    try {
      const row = await fetchCollection(id);
      if (!row) {
        notice = { tone: "error", text: "Không tải được bộ." };
        return;
      }
      detail = row;
      title = row.title;
      slug = row.slug;
      description = row.description;
      coverUrl = row.coverUrl ?? "";
      coverAlt = row.coverAlt ?? "";
      status = row.status;
      sortOrder = row.sortOrder;
      slugTouched = true;
      view = "detail";
      upsertList(row);
    } catch {
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      busy = false;
    }
  }

  async function saveMeta(publish = false) {
    if (busy) return;
    if (!title.trim()) {
      flashNotice("error", "Nhập tên bộ.");
      return;
    }

    busy = true;
    if (createOpen) createNotice = null;
    else notice = null;

    const nextStatus: CollectionStatus = publish
      ? "published"
      : metaMode === "create"
        ? "draft"
        : status;
    if (publish || metaMode === "create") status = nextStatus;

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      description: description.trim(),
      coverUrl: coverUrl.trim(),
      coverAlt: coverAlt.trim(),
      status: nextStatus,
      sortOrder
    };
    const creating = metaMode === "create";

    try {
      const response = await fetch(
        creating
          ? "/api/admin/collections"
          : `/api/admin/collections/${encodeURIComponent(detail!.id)}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const body = await response.json();
      if (!response.ok || !body?.success || !body.collection) {
        flashNotice("error", body?.error ?? "Không lưu được.");
        return;
      }

      const row = body.collection as CollectionDetail;
      upsertList(row);
      slugTouched = true;

      if (creating) {
        closeCreateModal();
        view = "grid";
        detail = null;
        notice = { tone: "ok", text: "Đã tạo bộ sưu tập." };
      } else {
        detail = row;
        closeCreateModal();
        view = "detail";
        notice = { tone: "ok", text: "Đã lưu bộ." };
      }
    } catch {
      flashNotice("error", "Không có kết nối.");
    } finally {
      busy = false;
    }
  }

  async function removeCollection() {
    if (!detail || !confirm("Xóa / lưu trữ bộ này?")) return;
    busy = true;
    notice = null;
    try {
      const response = await fetch(
        `/api/admin/collections/${encodeURIComponent(detail.id)}`,
        { method: "DELETE" }
      );
      const body = await response.json();
      if (!response.ok || !body?.success) {
        notice = {
          tone: "error",
          text: body?.error ?? "Không xóa được."
        };
        return;
      }
      if (body.archived) {
        await openDetail(detail.id);
        notice = {
          tone: "ok",
          text: "Bộ còn bài nên đã chuyển sang lưu trữ."
        };
      } else {
        collections = collections.filter((item) => item.id !== detail!.id);
        goGrid();
        notice = { tone: "ok", text: "Đã xóa bộ trống." };
      }
    } catch {
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      busy = false;
    }
  }

  function reorderLocalItems(contentIds: string[]) {
    if (!detail) return;
    const byId = new Map(
      detail.items.map((item) => [item.contentId, item] as const)
    );
    const items = contentIds.flatMap((id, index) => {
      const item = byId.get(id);
      return item ? [{ ...item, sortOrder: index }] : [];
    });
    detail = {
      ...detail,
      items,
      itemCount: items.length,
      publishedCount: items.filter((item) => item.status === "published").length,
      updatedAt: Math.floor(Date.now() / 1000)
    };
    upsertList(detail);
  }

  function queuePersistItems(collectionId: string, contentIds: string[]) {
    pendingItemIds = contentIds;

    persistChain = persistChain
      .then(async () => {
        const ids = pendingItemIds;
        pendingItemIds = null;
        if (!ids) return;

        persistInFlight += 1;
        itemsSaving = true;
        try {
          const response = await fetch(
            `/api/admin/collections/${encodeURIComponent(collectionId)}/items`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contentIds: ids })
            }
          );
          const body = await response.json();
          if (!response.ok || !body?.success || !body.collection) {
            notice = {
              tone: "error",
              text: body?.error ?? "Không lưu thứ tự bài."
            };
            if (detail?.id === collectionId) {
              await openDetail(collectionId);
            }
            return;
          }

          const saved = body.collection as CollectionSummary;
          if (pendingItemIds === null) {
            upsertList({
              ...saved,
              itemCount: detail?.id === collectionId
                ? (detail?.itemCount ?? saved.itemCount)
                : saved.itemCount,
              publishedCount: detail?.id === collectionId
                ? (detail?.publishedCount ?? saved.publishedCount)
                : saved.publishedCount
            });
          }
        } catch {
          notice = { tone: "error", text: "Không có kết nối." };
          if (detail?.id === collectionId) {
            await openDetail(collectionId);
          }
        } finally {
          persistInFlight = Math.max(0, persistInFlight - 1);
          itemsSaving = persistInFlight > 0 || pendingItemIds !== null;
        }
      })
      .catch(() => {
        /* hang doi */
      });
  }

  function removeItem(contentId: string) {
    if (!detail) return;
    const contentIds = detail.items
      .filter((item) => item.contentId !== contentId)
      .map((item) => item.contentId);
    reorderLocalItems(contentIds);
    queuePersistItems(detail.id, contentIds);
  }

  function moveItem(contentId: string, delta: -1 | 1) {
    if (!detail) return;
    const items = detail.items;
    const index = items.findIndex((item) => item.contentId === contentId);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= items.length) return;

    const reordered = [...items];
    const [row] = reordered.splice(index, 1);
    if (!row) return;
    reordered.splice(next, 0, row);

    const contentIds = reordered.map((item) => item.contentId);
    reorderLocalItems(contentIds);
    queuePersistItems(detail.id, contentIds);
  }

  async function openAddModal(item: CollectionSummary) {
    addTarget = item;
    addDetail = null;
    addQuery = "";
    addHits = [];
    addManualId = "";
    addNotice = "";
    addOpen = true;
    queueMicrotask(() => addDialog?.showModal());

    try {
      const row = await fetchCollection(item.id);
      if (row) {
        addDetail = row;
        upsertList(row);
      }
    } catch {
      addNotice = "Không tải được bộ — vẫn có thể thử thêm bằng mã bài.";
    }
  }

  function closeAddModal() {
    addDialog?.close();
    addOpen = false;
    addTarget = null;
    addDetail = null;
    addHits = [];
    addNotice = "";
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      void runSearch(addQuery);
    }, 220);
  }

  async function runSearch(q: string) {
    const query = q.trim();
    if (query.length < 1) {
      addHits = [];
      return;
    }

    addSearching = true;
    try {
      const params = new URLSearchParams({
        q: query,
        status: "all",
        catalog: "0",
        limit: "12"
      });
      const response = await fetch(`/api/admin/contents?${params}`);
      const body = await response.json();
      if (!response.ok || !body?.success || !Array.isArray(body.items)) {
        addHits = [];
        return;
      }
      addHits = body.items
        .filter(
          (row: Record<string, unknown>) =>
            typeof row.id === "string" && typeof row.title === "string"
        )
        .map((row: Record<string, unknown>) => ({
          id: row.id as string,
          title: row.title as string,
          status: typeof row.status === "string" ? row.status : "",
          kind: typeof row.kind === "string" ? row.kind : ""
        }));
    } catch {
      addHits = [];
    } finally {
      addSearching = false;
    }
  }

  async function appendToCollection(contentId: string) {
    if (!addTarget || addBusy) return;
    const id = contentId.trim();
    if (!id) {
      addNotice = "Nhập hoặc chọn một bài.";
      return;
    }

    const existing =
      addDetail?.items.map((item) => item.contentId) ??
      (await fetchCollection(addTarget.id))?.items.map((item) => item.contentId) ??
      [];

    if (existing.includes(id)) {
      addNotice = "Bài đã có trong bộ.";
      return;
    }

    addBusy = true;
    addNotice = "";
    try {
      const contentIds = [...existing, id];
      const response = await fetch(
        `/api/admin/collections/${encodeURIComponent(addTarget.id)}/items`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentIds })
        }
      );
      const body = await response.json();
      if (!response.ok || !body?.success || !body.collection) {
        addNotice = body?.error ?? "Không thêm được bài.";
        return;
      }

      const saved = body.collection as CollectionDetail;
      addDetail = saved;
      upsertList(saved);
      if (detail?.id === saved.id) detail = saved;
      addManualId = "";
      addNotice = "Đã thêm vào bộ.";
    } catch {
      addNotice = "Không có kết nối.";
    } finally {
      addBusy = false;
    }
  }

  const memberIds = $derived(
    new Set((addDetail?.items ?? []).map((item) => item.contentId))
  );
</script>

<AdminShell current="collections" onleave={leave} {pending}>
  <main class="main">
    <header class="page-head">
      <div>
        {#if view === "grid"}
          <h1>
            Bộ sưu tập
            <span class="count">{collections.length}</span>
          </h1>
          <p>Chọn bộ để xem chi tiết, hoặc bấm + để thêm bài nhanh.</p>
        {:else}
          <button type="button" class="back-link" onclick={goGrid}>
            ← Danh mục
          </button>
          <h1>{detail?.title ?? "Chi tiết bộ"}</h1>
          <p>Xem thông tin bộ và sắp xếp thứ tự bài vuốt.</p>
        {/if}
      </div>
      {#if view === "grid"}
        <button
          type="button"
          class="add-btn"
          onclick={startCreate}
          disabled={busy || createOpen}
        >
          + Bộ mới
        </button>
      {:else if detail}
        <button
          type="button"
          class="add-btn"
          disabled={busy || createOpen}
          onclick={() => void openAddModal(detail)}
        >
          + Thêm bài
        </button>
      {/if}
    </header>

    {#if notice}
      <p
        class="notice"
        class:ok={notice.tone === "ok"}
        class:err={notice.tone === "error"}
        role="status"
      >
        {notice.text}
      </p>
    {/if}

    {#if view === "grid"}
      {#if collections.length === 0}
        <div class="empty-page">
          <span class="empty-mark" aria-hidden="true">✳</span>
          <p>Chưa có bộ nào</p>
          <span>Tạo bộ đầu tiên để bắt đầu tuyển tập.</span>
          <button
            type="button"
            class="btn primary"
            onclick={startCreate}
            disabled={busy || createOpen}
          >
            Tạo bộ mới
          </button>
        </div>
      {:else}
        <ul class="card-grid">
          {#each collections as item (item.id)}
            <li>
              <article
                class="collection-card"
                class:archived={item.status === "archived"}
              >
                <div class="card-top">
                  <span class="status-pill" data-status={item.status}>
                    {statusLabel(item.status)}
                  </span>
                  <button
                    type="button"
                    class="plus-btn"
                    title="Thêm bài vào bộ"
                    aria-label={`Thêm bài vào ${item.title}`}
                    disabled={busy}
                    onclick={() => void openAddModal(item)}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                </div>

                <div class="card-cover" class:is-placeholder={!item.coverUrl}>
                  {#if item.coverUrl}
                    <img
                      src={item.coverUrl}
                      alt={item.coverAlt || item.title}
                      loading="lazy"
                      decoding="async"
                    />
                  {:else}
                    <span class="card-cover-mark" aria-hidden="true">❋</span>
                    <span class="card-cover-label">Chưa có ảnh bìa</span>
                  {/if}
                </div>

                <h2>{item.title}</h2>
                {#if item.description}
                  <p class="card-blurb">{item.description}</p>
                {:else}
                  <p class="card-blurb muted">Chưa có lời mở đầu</p>
                {/if}

                <div class="card-foot">
                  <span class="card-count">
                    <strong>{item.publishedCount}</strong>
                    /{item.itemCount} bài public
                  </span>
                  <button
                    type="button"
                    class="detail-link"
                    disabled={busy}
                    onclick={() => void openDetail(item.id)}
                  >
                    Xem chi tiết →
                  </button>
                </div>
              </article>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if detail}
      <section class="detail-layout" aria-label="Chi tiết bộ sưu tập">
        <aside class="detail-info">
          <div
            class="info-cover"
            class:is-placeholder={!detail.coverUrl}
          >
            {#if detail.coverUrl}
              <img
                src={detail.coverUrl}
                alt={detail.coverAlt || detail.title}
              />
            {:else}
              <span class="info-cover-mark" aria-hidden="true">❋</span>
              <span>Chưa có ảnh bìa</span>
            {/if}
          </div>

          <div class="info-body">
            <div class="info-top">
              <span class="status-pill" data-status={detail.status}>
                {statusLabel(detail.status)}
              </span>
              <span class="info-order">Thứ tự {detail.sortOrder}</span>
            </div>

            <h2 class="info-title">{detail.title}</h2>
            <p class="info-slug">
              <code>/c/{detail.slug}</code>
            </p>

            {#if detail.description}
              <p class="info-blurb">{detail.description}</p>
            {:else}
              <p class="info-blurb muted">Chưa có lời mở đầu</p>
            {/if}

            <dl class="info-meta">
              <div>
                <dt>Bài trong bộ</dt>
                <dd>{detail.items.length}</dd>
              </div>
              <div>
                <dt>Đã xuất bản</dt>
                <dd>{detail.publishedCount}</dd>
              </div>
            </dl>

            <div class="info-actions">
              <button
                type="button"
                class="btn primary"
                disabled={busy || createOpen}
                onclick={startEditMeta}
              >
                Chỉnh sửa thông tin
              </button>
              <a
                class="btn soft"
                href={`/c/${encodeURIComponent(detail.slug)}`}
                target="_blank"
                rel="noreferrer"
              >
                Xem public ↗
              </a>
              <button
                type="button"
                class="btn danger"
                onclick={() => void removeCollection()}
                disabled={busy}
              >
                Xóa / lưu trữ
              </button>
            </div>
          </div>
        </aside>

        <div class="detail-members">
          <div class="members">
            <div class="members-head">
              <div>
                <h3>Nội dung trong bộ</h3>
                <p>{detail.items.length} bài · thứ tự = thứ tự vuốt</p>
              </div>
              <span class="save-hint" class:on={itemsSaving} aria-live="polite">
                {itemsSaving ? "Đang lưu…" : "Đã đồng bộ"}
              </span>
            </div>

            {#if detail.items.length === 0}
              <div class="empty compact">
                <p>Chưa gắn bài</p>
                <span>Bấm “+ Thêm bài” ở đầu trang hoặc trên thẻ danh mục.</span>
              </div>
            {:else}
              <ol class="member-list">
                {#each detail.items as item, index (item.contentId)}
                  <li>
                    <span class="index" aria-hidden="true"
                      >{String(index + 1).padStart(2, "0")}</span
                    >
                    <div class="member-main">
                      <strong>{item.title}</strong>
                      <div class="member-meta">
                        <code>{item.contentId}</code>
                        <span class="format-pill">{formatLabel(item.format)}</span>
                        {#if item.status !== "published"}
                          <span class="status-pill tiny" data-status={item.status}>
                            {item.status}
                          </span>
                        {/if}
                      </div>
                    </div>
                    <div class="member-actions">
                      <button
                        type="button"
                        class="icon-btn"
                        title="Lên"
                        disabled={index === 0}
                        onclick={() => moveItem(item.contentId, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        class="icon-btn"
                        title="Xuống"
                        disabled={index === detail.items.length - 1}
                        onclick={() => moveItem(item.contentId, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        class="icon-btn danger-text"
                        title="Gỡ khỏi bộ"
                        onclick={() => removeItem(item.contentId)}
                      >
                        Gỡ
                      </button>
                    </div>
                  </li>
                {/each}
              </ol>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </main>
</AdminShell>

<dialog
  class="create-dialog"
  bind:this={createDialog}
  aria-labelledby="create-collection-title"
  onclose={() => {
    createOpen = false;
    createNotice = null;
  }}
>
  {#if createOpen}
    <form
      class="create-sheet"
      onsubmit={(event) => {
        event.preventDefault();
        void saveMeta(false);
      }}
    >
      <header class="create-head">
        <div class="create-head-copy">
          <h2 id="create-collection-title">
            {metaMode === "edit" ? "Chỉnh sửa bộ sưu tập" : "Thêm bộ sưu tập"}
          </h2>
          {#if metaMode === "edit"}
            <p class="status status-{status}">{statusLabel(status)}</p>
          {/if}
        </div>
        <button
          type="button"
          class="text-button create-close"
          onclick={closeCreateModal}
          disabled={busy}
        >
          Đóng
        </button>
      </header>

      {#if createNotice}
        <p
          class="create-notice"
          class:ok={createNotice.tone === "ok"}
          class:err={createNotice.tone === "error"}
          role={createNotice.tone === "error" ? "alert" : "status"}
        >
          {createNotice.text}
        </p>
      {/if}

      <div class="create-body">
        <fieldset class="create-pane" disabled={busy || coverUploading}>
          <p class="field-label">Ảnh bìa</p>
          <button
            type="button"
            class="create-cover-drop"
            class:has-image={!!coverUrl}
            class:is-busy={coverUploading}
            disabled={busy || coverUploading}
            onclick={() => createCoverInput?.click()}
          >
            {#if coverUrl}
              <img src={coverUrl} alt={coverAlt || title || "Ảnh bìa"} />
              <span class="create-cover-hint">
                {coverUploading ? "Đang tải…" : "Đổi ảnh"}
              </span>
            {:else}
              <span class="create-cover-mark" aria-hidden="true">❀</span>
              <strong>
                {coverUploading ? "Đang tải lên…" : "Kéo thả hoặc chọn ảnh"}
              </strong>
              <span>JPEG, PNG, WebP · tối đa 2 MB · tuỳ chọn</span>
            {/if}
          </button>
          <input
            bind:this={createCoverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            disabled={busy || coverUploading}
            onchange={onCoverPicked}
          />
          {#if coverUrl}
            <div class="create-cover-actions">
              <button
                type="button"
                class="chip"
                disabled={busy || coverUploading}
                onclick={() => createCoverInput?.click()}
              >
                Đổi ảnh
              </button>
              <button
                type="button"
                class="chip"
                disabled={busy || coverUploading}
                onclick={clearCover}
              >
                Gỡ ảnh
              </button>
            </div>
            <label class="field">
              <span>Chú thích ảnh</span>
              <input
                maxlength="160"
                placeholder="Mô tả ngắn cho ảnh bìa (tuỳ chọn)"
                bind:value={coverAlt}
                disabled={busy || coverUploading}
              />
            </label>
          {/if}

          <label class="field">
            <span>Tên bộ</span>
            <input
              maxlength="120"
              placeholder="Ví dụ: 100 câu nói động lực"
              bind:value={title}
              oninput={onTitleInput}
              disabled={busy}
              required
            />
          </label>

          <label class="field">
            <span>Đường dẫn</span>
            <div class="slug-row">
              <span class="slug-prefix">/c/</span>
              <input
                maxlength="80"
                bind:value={slug}
                oninput={() => (slugTouched = true)}
                disabled={busy}
              />
            </div>
          </label>

          <label class="field">
            <span>Lời mở đầu</span>
            <textarea
              rows="3"
              maxlength="400"
              placeholder="Một câu ngắn vì sao bộ này đáng đọc…"
              bind:value={description}
              disabled={busy}
            ></textarea>
          </label>

          {#if metaMode === "edit"}
            <p class="field-label" id="collection-status-label">Trạng thái</p>
            <div
              class="chips"
              role="group"
              aria-labelledby="collection-status-label"
            >
              <button
                type="button"
                class="chip"
                aria-pressed={status === "draft"}
                disabled={busy}
                onclick={() => (status = "draft")}
              >
                Nháp
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={status === "published"}
                disabled={busy}
                onclick={() => (status = "published")}
              >
                Xuất bản
              </button>
              <button
                type="button"
                class="chip"
                aria-pressed={status === "archived"}
                disabled={busy}
                onclick={() => (status = "archived")}
              >
                Lưu trữ
              </button>
            </div>
          {/if}

          <label class="field order-field">
            <span>Thứ tự</span>
            <input
              type="number"
              min="0"
              max="1000000"
              bind:value={sortOrder}
              disabled={busy}
            />
          </label>
        </fieldset>
      </div>

      <footer class="create-foot">
        <div class="create-foot-main">
          <button
            type="submit"
            disabled={busy || coverUploading || !title.trim()}
          >
            {busy
              ? "Đang lưu…"
              : metaMode === "edit" && status === "published"
                ? "Lưu thay đổi"
                : "Lưu bản nháp"}
          </button>
          <button
            type="button"
            class="primary"
            disabled={busy || coverUploading || !title.trim()}
            onclick={() => void saveMeta(true)}
          >
            Xuất bản
          </button>
        </div>
      </footer>
    </form>
  {/if}
</dialog>

<dialog
  class="add-dialog"
  bind:this={addDialog}
  onclose={() => {
    addOpen = false;
  }}
>
  {#if addOpen && addTarget}
    <form method="dialog" class="add-sheet" onsubmit={(e) => e.preventDefault()}>
      <header class="add-head">
        <div>
          <p class="eyebrow">Thêm vào bộ</p>
          <h2>{addTarget.title}</h2>
        </div>
        <button type="button" class="icon-btn" onclick={closeAddModal} aria-label="Đóng">
          ✕
        </button>
      </header>

      <label class="field">
        <span>Tìm bài theo tiêu đề</span>
        <input
          placeholder="Gõ vài chữ…"
          bind:value={addQuery}
          oninput={scheduleSearch}
          disabled={addBusy}
        />
      </label>

      {#if addSearching}
        <p class="add-status">Đang tìm…</p>
      {:else if addQuery.trim() && addHits.length === 0}
        <p class="add-status">Không thấy bài phù hợp.</p>
      {:else if addHits.length > 0}
        <ul class="hit-list">
          {#each addHits as hit (hit.id)}
            {@const already = memberIds.has(hit.id)}
            <li>
              <div class="hit-main">
                <strong>{hit.title}</strong>
                <span>
                  <code>{hit.id}</code>
                  · {hit.status}
                </span>
              </div>
              <button
                type="button"
                class="btn soft tiny"
                disabled={addBusy || already}
                onclick={() => void appendToCollection(hit.id)}
              >
                {already ? "Đã có" : "Thêm"}
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="add-divider"><span>hoặc dán mã bài</span></div>

      <div class="add-row">
        <input
          placeholder="c0a1…"
          bind:value={addManualId}
          disabled={addBusy}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void appendToCollection(addManualId);
            }
          }}
        />
        <button
          type="button"
          class="btn primary"
          disabled={addBusy}
          onclick={() => void appendToCollection(addManualId)}
        >
          Thêm
        </button>
      </div>

      {#if addNotice}
        <p class="add-status" role="status">{addNotice}</p>
      {/if}

      {#if addDetail}
        <p class="add-foot">
          Bộ đang có <strong>{addDetail.items.length}</strong> bài.
        </p>
      {/if}
    </form>
  {/if}
</dialog>

<style>
  .main {
    display: grid;
    gap: var(--space-4);
    align-content: start;
    padding: var(--space-6);
    color: var(--color-text);
    background:
      radial-gradient(
        900px 420px at 8% -12%,
        color-mix(in srgb, var(--color-primary) 14%, transparent),
        transparent 58%
      ),
      radial-gradient(
        700px 360px at 100% 0%,
        color-mix(in srgb, var(--color-theme-peace) 55%, transparent),
        transparent 50%
      ),
      var(--color-background);
  }

  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .page-head > div {
    min-width: 0;
    flex: 1 1 auto;
  }

  .page-head h1 {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  .page-head p {
    margin: var(--space-2) 0 0;
    max-width: 36rem;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .count {
    min-width: 1.5rem;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
    font-size: var(--text-xs);
    font-weight: 650;
    line-height: 1.6;
    text-align: center;
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

  .add-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .back-link {
    display: block;
    margin: 0 0 var(--space-2);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
  }

  .eyebrow {
    margin: 0 0 6px;
    color: var(--color-primary);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .notice {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 0.92rem;
  }

  .notice.ok {
    background: color-mix(in srgb, var(--color-primary) 14%, transparent);
    color: var(--color-primary-hover);
  }

  .notice.err {
    background: color-mix(in srgb, #c45c5c 14%, transparent);
    color: #c45c5c;
  }

  :global([data-theme="dark"]) .notice.ok {
    color: var(--color-primary);
  }

  .card-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    /* Toi da 4 cot, gian deu het chieu ngang. */
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-4);
    align-items: stretch;
  }

  .card-grid > li {
    display: flex;
    min-width: 0;
  }

  .collection-card {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    min-height: 100%;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent);
    border-radius: calc(var(--radius-lg) + 2px);
    background:
      linear-gradient(
        165deg,
        color-mix(in srgb, var(--color-primary) 9%, transparent),
        transparent 52%
      ),
      color-mix(in srgb, var(--color-surface) 94%, transparent);
    box-shadow: 0 10px 28px color-mix(in srgb, var(--color-text) 5%, transparent);
  }

  .collection-card.archived {
    opacity: 0.72;
  }

  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .plus-btn {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border: 1px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
    font-size: 1.35rem;
    font-weight: 500;
    line-height: 1;
    cursor: pointer;
    transition:
      transform 0.15s ease,
      background 0.15s ease;
  }

  .plus-btn:hover:not(:disabled) {
    transform: scale(1.05);
    background: color-mix(in srgb, var(--color-primary) 22%, transparent);
  }

  .card-cover {
    margin: 0 -4px;
    overflow: hidden;
    border-radius: calc(var(--radius-md) + 2px);
    aspect-ratio: 16 / 10;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  }

  .card-cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .card-cover.is-placeholder {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 0.35rem;
    background:
      radial-gradient(
        circle at 30% 25%,
        color-mix(in srgb, var(--color-primary) 18%, transparent),
        transparent 55%
      ),
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--color-primary) 12%, transparent),
        color-mix(in srgb, var(--color-surface-soft) 70%, transparent) 70%
      );
  }

  .card-cover-mark {
    color: var(--color-ornament, var(--color-brand-mark));
    font-family: var(--font-editorial);
    font-size: 1.55rem;
    line-height: 1;
  }

  .card-cover-label {
    color: var(--color-text-muted);
    font-size: 0.78rem;
    font-weight: 550;
    letter-spacing: 0.01em;
  }

  .collection-card h2 {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: 1.35rem;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.25;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    min-height: calc(1.25em * 2);
  }

  .cover-field > span {
    display: block;
    margin-bottom: 0.4rem;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .cover-row {
    display: grid;
    grid-template-columns: minmax(140px, 200px) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }

  .cover-preview {
    overflow: hidden;
    aspect-ratio: 16 / 10;
    border: 1px dashed color-mix(in srgb, var(--color-border) 90%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-soft) 80%, transparent);
  }

  .cover-preview.empty {
    display: grid;
    place-items: center;
    color: var(--color-text-muted);
    font-size: 0.82rem;
  }

  .cover-preview img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-controls {
    display: grid;
    gap: 10px;
    justify-items: start;
  }

  .cover-url-field {
    display: grid;
    gap: 4px;
    width: 100%;
  }

  .cover-url-field span {
    color: var(--color-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .cover-url-field input {
    width: 100%;
    min-height: 2.4rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  @media (max-width: 767px) {
    .cover-row {
      grid-template-columns: 1fr;
    }
  }

  .card-blurb {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.88rem;
    line-height: 1.45;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    min-height: calc(1.45em * 2);
    flex: 1 1 auto;
  }

  .card-blurb.muted {
    font-style: italic;
    opacity: 0.8;
  }

  .card-foot {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: auto;
    padding-top: 4px;
  }

  .card-count {
    color: var(--color-text-secondary);
    font-size: 0.8rem;
  }

  .card-count strong {
    color: var(--color-primary);
    font-weight: 750;
  }

  .detail-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font: inherit;
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
  }

  .empty-page,
  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 2.5rem 1.25rem;
    border: 1px dashed color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
    border-radius: var(--radius-lg);
    background:
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--color-primary) 8%, transparent),
        transparent 60%
      );
    text-align: center;
  }

  .empty.compact {
    padding: 1.25rem 1rem;
  }

  .empty-mark {
    color: var(--color-primary);
    font-family: var(--font-editorial);
    font-size: 1.8rem;
  }

  .empty-page p,
  .empty p {
    margin: 0;
    font-weight: 650;
  }

  .empty-page span,
  .empty span {
    color: var(--color-text-secondary);
    font-size: 0.88rem;
  }

  .detail-layout {
    display: grid;
    grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
  }

  .detail-info {
    position: sticky;
    top: var(--space-4);
    display: grid;
    gap: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
    border-radius: calc(var(--radius-lg) + 2px);
    background: color-mix(in srgb, var(--color-surface) 94%, transparent);
    box-shadow: 0 12px 32px color-mix(in srgb, var(--color-text) 5%, transparent);
  }

  .info-cover {
    position: relative;
    aspect-ratio: 16 / 10;
    background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface-soft));
  }

  .info-cover.is-placeholder {
    display: grid;
    place-content: center;
    gap: 0.35rem;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
    text-align: center;
  }

  .info-cover img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .info-cover-mark {
    font-size: 1.4rem;
    opacity: 0.7;
  }

  .info-body {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .info-top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .info-order {
    color: var(--color-text-secondary);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .info-title {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: 1.35rem;
    font-weight: 400;
    letter-spacing: -0.02em;
    line-height: 1.25;
  }

  .info-slug {
    margin: 0;
  }

  .info-slug code {
    font-size: 0.8rem;
    color: var(--color-primary);
  }

  .info-blurb {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .info-blurb.muted {
    font-style: italic;
    opacity: 0.85;
  }

  .info-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    margin: 0;
  }

  .info-meta div {
    display: grid;
    gap: 0.15rem;
    padding: 0.65rem 0.75rem;
    border-radius: var(--radius-md);
    background: var(--color-surface-soft);
  }

  .info-meta dt {
    color: var(--color-text-secondary);
    font-size: 0.72rem;
    font-weight: 650;
  }

  .info-meta dd {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 650;
  }

  .info-actions {
    display: grid;
    gap: 0.55rem;
  }

  .info-actions .btn {
    width: 100%;
    justify-content: center;
  }

  .detail-members {
    min-width: 0;
  }

  .detail-members .members {
    margin: 0;
    padding: var(--space-4);
    border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
    border-radius: calc(var(--radius-lg) + 2px);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .field {
    display: grid;
    gap: 0.4rem;
    font-size: 0.86rem;
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .field > span {
    color: var(--color-text-secondary);
    font-weight: 650;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.72rem 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
    color: inherit;
    font: inherit;
  }

  input:focus,
  textarea:focus,
  select:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent);
  }

  textarea {
    resize: vertical;
    min-height: 5.5rem;
    line-height: 1.45;
  }

  .slug-row {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
    overflow: hidden;
  }

  .slug-row:focus-within {
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 16%, transparent);
  }

  .slug-prefix {
    display: grid;
    place-items: center;
    padding: 0 0.75rem;
    background: color-mix(in srgb, var(--color-primary) 10%, transparent);
    color: var(--color-primary);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .slug-row input {
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .actions,
  .add-row,
  .member-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.65rem 1rem;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    font: inherit;
    font-size: 0.9rem;
    font-weight: 650;
    text-decoration: none;
    cursor: pointer;
  }

  .btn.tiny {
    padding: 0.4rem 0.7rem;
    font-size: 0.8rem;
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--color-primary);
    color: #f7faf7;
  }

  .btn.soft {
    border-color: var(--color-border);
    background: color-mix(in srgb, var(--color-surface) 70%, transparent);
    color: var(--color-text);
  }

  .btn.danger {
    border-color: color-mix(in srgb, #c45c5c 35%, transparent);
    background: transparent;
    color: #c45c5c;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-text) 8%, transparent);
    color: var(--color-text-secondary);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .status-pill[data-status="published"] {
    background: color-mix(in srgb, var(--color-primary) 18%, transparent);
    color: var(--color-primary-hover);
  }

  .status-pill[data-status="archived"] {
    background: color-mix(in srgb, #c45c5c 14%, transparent);
    color: #c45c5c;
  }

  :global([data-theme="dark"]) .status-pill[data-status="published"] {
    color: var(--color-primary);
  }

  .status-pill.tiny {
    text-transform: lowercase;
  }

  .members {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid color-mix(in srgb, var(--color-border) 90%, transparent);
  }

  .members-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .members-head h3 {
    margin: 0 0 4px;
    font-size: 1.05rem;
  }

  .members-head p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
  }

  .save-hint {
    min-width: 5.5rem;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    font-weight: 650;
    opacity: 0;
    text-align: right;
    transition: opacity 0.15s ease;
  }

  .save-hint.on {
    opacity: 1;
    color: var(--color-primary);
  }

  .member-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .member-list li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 12px;
    align-items: center;
    padding: 12px 12px 12px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
  }

  .index {
    width: 2rem;
    color: var(--color-primary);
    font-family: var(--font-editorial);
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .member-main {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .member-main strong {
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.35;
  }

  .member-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .member-meta code,
  .hit-main code {
    padding: 2px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--color-text) 6%, transparent);
    color: var(--color-text-secondary);
    font-size: 0.72rem;
  }

  .format-pill {
    padding: 2px 7px;
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary-hover);
    font-size: 0.68rem;
    font-weight: 700;
  }

  :global([data-theme="dark"]) .format-pill {
    color: var(--color-primary);
  }

  .icon-btn {
    min-width: 2rem;
    padding: 0.35rem 0.55rem;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 650;
    cursor: pointer;
  }

  .icon-btn:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
    color: var(--color-primary);
  }

  .icon-btn:disabled {
    opacity: 0.35;
  }

  .icon-btn.danger-text:hover:not(:disabled) {
    border-color: color-mix(in srgb, #c45c5c 40%, transparent);
    color: #c45c5c;
  }

  .create-dialog,
  .add-dialog {
    margin: auto;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background);
    color: var(--color-text);
  }

  .create-dialog {
    --create-inset: 1.5rem;
    width: min(720px, calc(100vw - var(--create-inset)));
    height: calc(100dvh - var(--create-inset));
    max-height: calc(100dvh - var(--create-inset));
    overflow: hidden;
  }

  .add-dialog {
    width: min(520px, calc(100vw - 2rem));
  }

  .create-dialog::backdrop,
  .add-dialog::backdrop {
    background: color-mix(in oklab, #0a100c 52%, transparent);
    backdrop-filter: blur(5px);
  }

  :global(html[data-theme="dark"]) .create-dialog::backdrop,
  :global(html[data-theme="dark"]) .add-dialog::backdrop {
    background: color-mix(in oklab, #020403 78%, transparent);
  }

  .create-sheet {
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

  .create-head {
    display: flex;
    flex: 0 0 auto;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .create-head-copy {
    min-width: 0;
  }

  .create-head h2 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  .create-head .status {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
  }

  .text-button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    cursor: pointer;
  }

  .create-close {
    flex: 0 0 auto;
    min-height: 2.5rem;
    padding: 0.35rem 0.5rem;
    font-weight: 600;
  }

  .create-body {
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    margin-inline-end: calc(-1 * var(--space-5));
    padding-inline-end: var(--space-5);
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .create-pane {
    display: grid;
    align-content: start;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
  }

  .field-label {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .chip[aria-pressed="true"] {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .order-field {
    max-width: 10rem;
  }

  .create-cover-drop {
    position: relative;
    display: grid;
    place-items: center;
    gap: 0.35rem;
    width: 100%;
    min-height: 180px;
    padding: 1rem;
    overflow: hidden;
    border: 1px dashed color-mix(in srgb, var(--color-border) 90%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-surface-soft) 88%, transparent);
    color: var(--color-text-secondary);
    text-align: center;
    cursor: pointer;
  }

  .create-cover-drop:hover:not(:disabled) {
    border-color: var(--color-primary);
  }

  .create-cover-drop:disabled,
  .create-cover-drop.is-busy {
    cursor: progress;
    opacity: 0.8;
  }

  .create-cover-drop.has-image {
    padding: 0;
    border-style: solid;
  }

  .create-cover-drop img {
    display: block;
    width: 100%;
    height: 180px;
    object-fit: cover;
  }

  .create-cover-mark {
    color: var(--color-ornament, var(--color-brand-mark));
    font-family: var(--font-editorial);
    font-size: 1.5rem;
    line-height: 1;
  }

  .create-cover-drop strong {
    color: var(--color-text);
    font-size: 0.95rem;
    font-weight: 650;
  }

  .create-cover-drop span:not(.create-cover-mark):not(.create-cover-hint) {
    font-size: 0.78rem;
  }

  .create-cover-hint {
    position: absolute;
    right: 10px;
    bottom: 10px;
    padding: 0.28rem 0.55rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-surface) 88%, transparent);
    color: var(--color-text);
    font-size: 0.75rem;
    font-weight: 650;
  }

  .create-cover-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .create-notice {
    flex: 0 0 auto;
    margin: 0;
    padding: 0.7rem 0.85rem;
    border-radius: var(--radius-md);
    font-size: 0.88rem;
  }

  .create-notice.ok {
    background: color-mix(in srgb, var(--color-success) 14%, transparent);
    color: var(--color-success);
  }

  .create-notice.err {
    background: color-mix(in srgb, var(--color-error) 14%, transparent);
    color: var(--color-error);
  }

  .create-foot {
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

  .create-foot-main {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .create-foot-main > button {
    min-height: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .create-foot-main > button.primary {
    border: 0;
    background: var(--color-primary);
    color: var(--color-surface);
    font-weight: 650;
  }

  .create-foot-main > button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-draft {
    color: var(--color-text-secondary);
  }

  .status-published {
    color: var(--color-success, var(--color-primary));
  }

  .status-archived {
    color: var(--color-text-muted, var(--color-text-secondary));
  }

  @media (max-width: 767px) {
    .create-cover-drop,
    .create-cover-drop img {
      min-height: 160px;
      height: 160px;
    }

    .order-field {
      max-width: none;
    }
  }

  .add-sheet {
    display: grid;
    gap: 14px;
    padding: 1.25rem 1.35rem 1.4rem;
  }

  .add-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .add-head h2 {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: 1.35rem;
    font-weight: 400;
    letter-spacing: -0.02em;
  }

  .hit-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
    max-height: 240px;
    overflow: auto;
  }

  .hit-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-background);
  }

  .hit-main {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .hit-main strong {
    font-size: 0.92rem;
    line-height: 1.3;
  }

  .hit-main span {
    color: var(--color-text-secondary);
    font-size: 0.78rem;
  }

  .add-divider {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 10px;
    align-items: center;
    color: var(--color-text-secondary);
    font-size: 0.75rem;
  }

  .add-divider::before,
  .add-divider::after {
    content: "";
    height: 1px;
    background: var(--color-border);
  }

  .add-status,
  .add-foot {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.85rem;
  }

  .add-row input {
    flex: 1 1 180px;
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

    .add-btn {
      justify-self: stretch;
      min-height: 2.75rem;
      width: 100%;
    }

    .card-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .member-list li {
      grid-template-columns: auto 1fr;
    }

    .member-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }

    .create-dialog,
    .add-dialog {
      width: 100vw;
      max-width: 100vw;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0;
      border: 0;
      border-radius: 0;
      overflow: hidden;
    }

    .create-sheet {
      gap: 0;
      height: 100%;
      max-height: 100%;
      padding: 0;
      padding-top: env(safe-area-inset-top);
    }

    .create-head,
    .add-head {
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--color-border);
      background: var(--color-surface);
    }

    .create-head h2 {
      font-size: 1.1rem;
    }

    .create-notice {
      margin: var(--space-3) var(--space-4) 0;
    }

    .create-body {
      min-height: 0;
      margin-inline-end: 0;
      overflow: auto;
      overscroll-behavior: contain;
      padding: var(--space-4);
    }

    .create-cover-drop,
    .create-cover-drop img {
      min-height: 160px;
      height: 160px;
    }

    .create-foot {
      flex-direction: column;
      align-items: stretch;
      gap: var(--space-2);
      margin: 0;
      padding: var(--space-3) var(--space-4);
      padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
      background: color-mix(in oklab, var(--color-surface) 92%, transparent);
    }

    .create-foot-main {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
      gap: var(--space-2);
    }

    .create-foot-main > button {
      width: 100%;
    }

    .add-dialog {
      overflow: auto;
    }

    .add-sheet {
      min-height: 100dvh;
      padding: 0 0 max(var(--space-4), env(safe-area-inset-bottom));
      padding-top: env(safe-area-inset-top);
      gap: var(--space-3);
    }

    .add-sheet > :not(.add-head) {
      padding-inline: var(--space-4);
    }
  }

  /* Tablet hẹp / phone: xếp dọc — info trên, danh sách dưới */
  @media (max-width: 900px) {
    .detail-layout {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .detail-info {
      position: static;
    }

    .info-actions {
      grid-template-columns: 1fr 1fr;
    }

    .info-actions .btn.primary {
      grid-column: 1 / -1;
    }

    .info-actions .btn.danger {
      grid-column: 1 / -1;
    }
  }

  @media (max-width: 767px) {
    .main {
      padding: var(--space-3);
    }

    .page-head h1 {
      font-size: 1.25rem;
    }

    .page-head p {
      font-size: 0.82rem;
    }

    .card-grid {
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    .collection-card h2 {
      font-size: 1.2rem;
    }

    .info-actions {
      grid-template-columns: 1fr;
    }

    .info-actions .btn.primary,
    .info-actions .btn.danger {
      grid-column: auto;
    }

    .detail-members .members {
      padding: var(--space-3);
    }

    .info-body {
      padding: var(--space-3);
    }
  }
</style>
