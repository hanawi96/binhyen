<script lang="ts">
  import type {
    CollectionDetail,
    CollectionStatus,
    CollectionSummary
  } from "../collections/d1-collections";
  import { slugFromTitle } from "../collections/d1-collections";
  import AdminNav from "./AdminNav.svelte";

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
  let coverFileInput = $state<HTMLInputElement | null>(null);
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

  function startCreate() {
    if (busy || createOpen) return;
    resetMetaForm();
    createNotice = null;
    notice = null;
    createOpen = true;
    queueMicrotask(() => createDialog?.showModal());
  }

  function closeCreateModal() {
    createDialog?.close();
    createOpen = false;
    createNotice = null;
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

  async function saveMeta() {
    if (busy) return;
    if (!title.trim()) {
      flashNotice("error", "Nhập tên bộ.");
      return;
    }

    busy = true;
    if (createOpen) createNotice = null;
    else notice = null;

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      description: description.trim(),
      coverUrl: coverUrl.trim(),
      coverAlt: coverAlt.trim(),
      status,
      sortOrder
    };
    const creating = createOpen;

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

<div class="shell">
  <AdminNav current="collections" onleave={leave} {pending} />
  <main class="main">
    <header class="head">
      <div class="head-copy">
        {#if view === "grid"}
          <p class="eyebrow">Biên tập</p>
          <h1>Bộ sưu tập</h1>
          <p>Chọn bộ để xem chi tiết, hoặc bấm + để thêm bài nhanh.</p>
        {:else}
          <button type="button" class="back-link" onclick={goGrid}>
            ← Danh mục
          </button>
          <h1>{detail?.title ?? "Chi tiết bộ"}</h1>
          <p>Chỉnh meta và sắp xếp thứ tự vuốt.</p>
        {/if}
      </div>
      <div class="head-actions">
        {#if view === "grid"}
          <span class="count-pill">{collections.length} bộ</span>
          <button
            type="button"
            class="btn soft"
            onclick={startCreate}
            disabled={busy || createOpen}
          >
            + Bộ mới
          </button>
        {/if}
      </div>
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
    {:else}
      <section class="editor-panel" aria-label="Chỉnh bộ">
        <div class="form-grid">
          <label class="field wide">
            <span>Tên bộ</span>
            <input
              maxlength="120"
              placeholder="Ví dụ: 100 câu nói động lực"
              bind:value={title}
              oninput={onTitleInput}
              disabled={busy}
            />
          </label>

          <label class="field wide">
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

          <label class="field wide">
            <span>Lời mở đầu</span>
            <textarea
              rows="3"
              maxlength="400"
              placeholder="Một câu ngắn vì sao bộ này đáng đọc…"
              bind:value={description}
              disabled={busy}
            ></textarea>
          </label>

          <div class="field wide cover-field">
            <span>Ảnh bìa</span>
            <div class="cover-row">
              <div class="cover-preview" class:empty={!coverUrl}>
                {#if coverUrl}
                  <img
                    src={coverUrl}
                    alt={coverAlt || title || "Ảnh bìa"}
                  />
                {:else}
                  <span>Chưa có ảnh</span>
                {/if}
              </div>
              <div class="cover-controls">
                <input
                  bind:this={coverFileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  hidden
                  onchange={onCoverPicked}
                />
                <button
                  type="button"
                  class="btn soft"
                  disabled={busy || coverUploading}
                  onclick={() => coverFileInput?.click()}
                >
                  {coverUploading
                    ? "Đang tải…"
                    : coverUrl
                      ? "Đổi ảnh"
                      : "Chọn ảnh"}
                </button>
                {#if coverUrl}
                  <button
                    type="button"
                    class="btn soft"
                    disabled={busy || coverUploading}
                    onclick={clearCover}
                  >
                    Gỡ ảnh
                  </button>
                {/if}
                <label class="cover-url-field">
                  <span>Hoặc dán URL</span>
                  <input
                    type="url"
                    placeholder="/api/media/image/… hoặc https://…"
                    bind:value={coverUrl}
                    disabled={busy || coverUploading}
                  />
                </label>
                <label class="cover-url-field">
                  <span>Chú thích ảnh</span>
                  <input
                    maxlength="160"
                    placeholder="Mô tả ngắn cho ảnh bìa"
                    bind:value={coverAlt}
                    disabled={busy || coverUploading}
                  />
                </label>
              </div>
            </div>
          </div>

          <label class="field">
            <span>Trạng thái</span>
            <select bind:value={status} disabled={busy}>
              <option value="draft">Nháp</option>
              <option value="published">Xuất bản</option>
              <option value="archived">Lưu trữ</option>
            </select>
          </label>

          <label class="field">
            <span>Thứ tự danh mục</span>
            <input
              type="number"
              min="0"
              max="1000000"
              bind:value={sortOrder}
              disabled={busy}
            />
          </label>
        </div>

        <div class="actions">
          <button
            type="button"
            class="btn primary"
            onclick={() => void saveMeta()}
            disabled={busy}
          >
            Lưu bộ
          </button>
          {#if detail}
            <button
              type="button"
              class="btn soft"
              disabled={busy}
              onclick={() => void openAddModal(detail)}
            >
              + Thêm bài
            </button>
            <a
              class="btn soft"
              href={`/c/${encodeURIComponent(slug)}`}
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
          {/if}
        </div>

        {#if view === "detail" && detail}
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
                <span>Bấm “+ Thêm bài” hoặc dấu + trên thẻ danh mục.</span>
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
        {/if}
      </section>
    {/if}
  </main>
</div>

<dialog
  class="create-dialog"
  bind:this={createDialog}
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
        void saveMeta();
      }}
    >
      <header class="create-head">
        <div class="create-head-copy">
          <p class="eyebrow">Bộ sưu tập mới</p>
          <h2>Tạo tuyển tập</h2>
          <p class="create-lede">
            Đặt tên, ảnh bìa và lời mở đầu — gắn bài sau bằng nút + trên thẻ.
          </p>
        </div>
        <button
          type="button"
          class="icon-btn create-close"
          onclick={closeCreateModal}
          aria-label="Đóng"
          disabled={busy}
        >
          ✕
        </button>
      </header>

      <div class="create-body">
        <div class="create-cover-pane">
          <button
            type="button"
            class="create-cover-drop"
            class:has-image={!!coverUrl}
            disabled={busy || coverUploading}
            onclick={() => createCoverInput?.click()}
          >
            {#if coverUrl}
              <img src={coverUrl} alt={coverAlt || title || "Ảnh bìa"} />
              <span class="create-cover-hint">Đổi ảnh</span>
            {:else}
              <span class="create-cover-mark" aria-hidden="true">❀</span>
              <strong>{coverUploading ? "Đang tải…" : "Thêm ảnh bìa"}</strong>
              <span>JPG, PNG hoặc WebP · tối đa 2MB</span>
            {/if}
          </button>
          <input
            bind:this={createCoverInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onchange={onCoverPicked}
          />
          {#if coverUrl}
            <div class="create-cover-actions">
              <button
                type="button"
                class="btn soft tiny"
                disabled={busy || coverUploading}
                onclick={() => createCoverInput?.click()}
              >
                Đổi ảnh
              </button>
              <button
                type="button"
                class="btn soft tiny"
                disabled={busy || coverUploading}
                onclick={clearCover}
              >
                Gỡ ảnh
              </button>
            </div>
          {/if}
        </div>

        <div class="create-fields">
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

          <div class="create-meta-row">
            <label class="field">
              <span>Trạng thái</span>
              <select bind:value={status} disabled={busy}>
                <option value="draft">Nháp</option>
                <option value="published">Xuất bản</option>
                <option value="archived">Lưu trữ</option>
              </select>
            </label>
            <label class="field">
              <span>Thứ tự</span>
              <input
                type="number"
                min="0"
                max="1000000"
                bind:value={sortOrder}
                disabled={busy}
              />
            </label>
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
        </div>
      </div>

      {#if createNotice}
        <p
          class="create-notice"
          class:ok={createNotice.tone === "ok"}
          class:err={createNotice.tone === "error"}
          role="status"
        >
          {createNotice.text}
        </p>
      {/if}

      <footer class="create-foot">
        <button
          type="button"
          class="btn soft"
          onclick={closeCreateModal}
          disabled={busy}
        >
          Huỷ
        </button>
        <button
          type="submit"
          class="btn primary"
          disabled={busy || coverUploading || !title.trim()}
        >
          {busy ? "Đang tạo…" : "Tạo bộ"}
        </button>
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
  .shell {
    display: grid;
    grid-template-columns: 240px 1fr;
    min-height: 100dvh;
    color: var(--color-text);
  }

  .main {
    display: grid;
    gap: var(--space-4);
    align-content: start;
    padding: var(--space-6);
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

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .eyebrow {
    margin: 0 0 6px;
    color: var(--color-primary);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .head h1 {
    margin: 0 0 6px;
    font-family: var(--font-editorial);
    font-size: clamp(1.8rem, 3vw, 2.35rem);
    font-weight: 400;
    letter-spacing: -0.03em;
  }

  .head-copy > p:last-child {
    margin: 0;
    max-width: 36rem;
    color: var(--color-text-secondary);
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .back-link {
    margin: 0 0 8px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font: inherit;
    font-size: 0.88rem;
    font-weight: 700;
    cursor: pointer;
  }

  .head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .count-pill {
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: color-mix(in srgb, var(--color-surface) 88%, transparent);
    color: var(--color-text-secondary);
    font-size: 0.78rem;
    font-weight: 650;
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
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px;
  }

  .collection-card {
    display: grid;
    gap: 10px;
    min-height: 180px;
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

  @media (max-width: 640px) {
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
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .card-blurb.muted {
    font-style: italic;
    opacity: 0.8;
  }

  .card-foot {
    display: flex;
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

  .editor-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
    border-radius: calc(var(--radius-lg) + 2px);
    background: color-mix(in srgb, var(--color-surface) 92%, transparent);
    box-shadow: 0 12px 32px color-mix(in srgb, var(--color-text) 5%, transparent);
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
    border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
    border-radius: calc(var(--radius-lg) + 4px);
    background: var(--color-surface);
    color: var(--color-text);
    box-shadow: 0 28px 80px color-mix(in srgb, var(--color-text) 16%, transparent);
  }

  .create-dialog {
    width: min(760px, calc(100vw - 1.5rem));
    max-height: min(92dvh, 900px);
    overflow: auto;
  }

  .add-dialog {
    width: min(520px, calc(100vw - 2rem));
  }

  .create-dialog::backdrop,
  .add-dialog::backdrop {
    background: color-mix(in srgb, #0f1411 52%, transparent);
    backdrop-filter: blur(4px);
  }

  .create-sheet {
    display: grid;
    gap: 1.25rem;
    padding: 1.4rem 1.5rem 1.35rem;
  }

  .create-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .create-head-copy {
    display: grid;
    gap: 0.3rem;
    min-width: 0;
  }

  .create-head h2 {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: clamp(1.55rem, 3vw, 1.85rem);
    font-weight: 400;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }

  .create-lede {
    margin: 0.15rem 0 0;
    max-width: 34rem;
    color: var(--color-text-secondary);
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .create-close {
    flex: none;
  }

  .create-body {
    display: grid;
    grid-template-columns: minmax(200px, 0.92fr) minmax(0, 1.2fr);
    gap: 1.25rem 1.4rem;
    align-items: start;
  }

  .create-cover-pane {
    display: grid;
    gap: 0.65rem;
  }

  .create-cover-drop {
    position: relative;
    display: grid;
    place-items: center;
    gap: 0.35rem;
    width: 100%;
    min-height: 220px;
    padding: 1rem;
    overflow: hidden;
    border: 0;
    border-radius: calc(var(--radius-lg) + 2px);
    background:
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--color-primary) 10%, transparent),
        transparent 55%
      ),
      color-mix(in srgb, var(--color-surface-soft) 88%, transparent);
    color: var(--color-text-secondary);
    text-align: center;
    cursor: pointer;
    transition:
      transform 160ms ease,
      background 160ms ease,
      filter 160ms ease;
  }

  .create-cover-drop:hover:not(:disabled) {
    filter: brightness(1.04);
    transform: translateY(-1px);
  }

  .create-cover-drop:disabled {
    cursor: progress;
    opacity: 0.8;
  }

  .create-cover-drop.has-image {
    padding: 0;
  }

  .create-cover-drop img {
    display: block;
    width: 100%;
    height: 220px;
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
    gap: 8px;
  }

  .create-fields {
    display: grid;
    gap: 0.85rem;
  }

  .create-meta-row {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 0.75rem;
  }

  .create-notice {
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
    justify-content: flex-end;
    gap: 0.65rem;
    padding-top: 0.15rem;
    border-top: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
  }

  @media (max-width: 720px) {
    .create-body,
    .create-meta-row {
      grid-template-columns: 1fr;
    }

    .create-cover-drop,
    .create-cover-drop img {
      min-height: 180px;
      height: 180px;
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

  @media (max-width: 900px) {
    .shell,
    .form-grid {
      grid-template-columns: 1fr;
    }

    .member-list li {
      grid-template-columns: auto 1fr;
    }

    .member-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }
  }
</style>
