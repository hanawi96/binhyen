<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  import { catalogSlugFromLabel } from "./catalog";
  import type { CatalogEntry } from "./d1-catalog";
  import AdminShell from "./AdminShell.svelte";

  interface Props {
    initialTopics: CatalogEntry[];
    initialMoods: CatalogEntry[];
    pending: number;
  }

  let { initialTopics, initialMoods, pending }: Props = $props();

  let topics = $state(initialTopics.map(copyEntry));
  let moods = $state(initialMoods.map(copyEntry));
  let editing = $state<{ kind: "topic" | "mood"; slug: string } | null>(null);
  let draftLabel = $state("");
  let draftOrder = $state(0);
  let savingSlug = $state("");
  let notice = $state<{ slug: string; tone: "ok" | "error"; text: string } | null>(
    null
  );

  let createDialog = $state<HTMLDialogElement | null>(null);
  let createLabel = $state("");
  let createKind = $state<"topic" | "mood">("topic");
  let creating = $state(false);
  let createError = $state("");

  let createSlugPreview = $derived(catalogSlugFromLabel(createLabel) ?? "");

  const looks: Record<string, { blurb: string; icon: IconName }> = {
    peace: { blurb: "Một khoảng lặng cho tâm hồn.", icon: "leaf" },
    stories: { blurb: "Những câu chuyện ấm áp.", icon: "book" },
    science: { blurb: "Bất ngờ từ thế giới quanh ta.", icon: "spark" },
    nature: { blurb: "Vẻ đẹp rất đỗi diệu kỳ.", icon: "sprout" },
    psychology: { blurb: "Hiểu mình, hiểu người hơn.", icon: "balance" },
    perspective: { blurb: "Tìm vẻ đẹp trong điều giản dị.", icon: "sun" },
    cute: { blurb: "Những điều nhỏ làm ngày dịu lại.", icon: "heart" },
    tips: { blurb: "Một mẹo nhỏ, một ngày nhẹ hơn.", icon: "bulb" },
    calm: { blurb: "Khi lòng muốn được yên.", icon: "leaf" },
    tired: { blurb: "Một chỗ để nghỉ, không cần vội.", icon: "moon" },
    stressed: { blurb: "Thả bớt những gì đang siết.", icon: "cloud" },
    sad: { blurb: "Ở lại với nỗi buồn một lát.", icon: "drop" },
    happy: { blurb: "Giữ lấy niềm vui đang có.", icon: "sun" },
    curious: { blurb: "Một câu hỏi mở cho hôm nay.", icon: "spark" }
  };

  type IconName =
    | "leaf"
    | "book"
    | "spark"
    | "sprout"
    | "balance"
    | "sun"
    | "heart"
    | "bulb"
    | "moon"
    | "cloud"
    | "drop"
    | "arrow";

  function lookFor(slug: string) {
    return (
      looks[slug] ?? {
        blurb: "Mục trong danh mục.",
        icon: "spark" as const
      }
    );
  }

  function copyEntry(item: CatalogEntry): CatalogEntry {
    return {
      slug: item.slug,
      label: item.label,
      sortOrder: item.sortOrder,
      used: item.used
    };
  }

  function listFor(kind: "topic" | "mood"): CatalogEntry[] {
    return kind === "topic" ? topics : moods;
  }

  function editingItem(): CatalogEntry | null {
    if (!editing) return null;
    return listFor(editing.kind).find((item) => item.slug === editing?.slug) ?? null;
  }

  function dirty(): boolean {
    const item = editingItem();
    if (!item) return false;
    return item.label !== draftLabel.trim() || item.sortOrder !== draftOrder;
  }

  function onBeforeUnload(event: BeforeUnloadEvent) {
    if (!savingSlug && !dirty()) return;
    event.preventDefault();
  }

  onMount(() => {
    window.addEventListener("beforeunload", onBeforeUnload);
  });

  onDestroy(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("beforeunload", onBeforeUnload);
  });

  function confirmDiscard(): boolean {
    if (!dirty()) return true;
    return confirm("Mục đang sửa chưa được lưu. Đóng chứ?");
  }

  async function leave() {
    if (!confirmDiscard()) return;

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Cookie het han van dua ve trang dang nhap.
    }

    window.location.replace("/admin/login");
  }

  function beginEdit(kind: "topic" | "mood", item: CatalogEntry) {
    if (editing?.kind === kind && editing.slug === item.slug) return;
    if (!confirmDiscard()) return;

    editing = { kind, slug: item.slug };
    draftLabel = item.label;
    draftOrder = item.sortOrder;
    notice = null;
  }

  function cancelEdit() {
    if (!confirmDiscard()) return;
    editing = null;
    notice = null;
  }

  function openCreate() {
    if (!confirmDiscard()) return;
    editing = null;
    createLabel = "";
    createKind = "topic";
    createError = "";
    createDialog?.showModal();
  }

  function closeCreate() {
    if (creating) return;
    createDialog?.close();
    createError = "";
  }

  async function submitCreate() {
    if (creating) return;
    const label = createLabel.trim();
    if (!label) {
      createError = "Hãy nhập tên.";
      return;
    }

    creating = true;
    createError = "";

    try {
      const response = await fetch("/api/admin/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: createKind, label })
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        createError =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Không tạo được.";
        return;
      }

      const saved =
        body &&
        typeof body === "object" &&
        "item" in body &&
        body.item &&
        typeof body.item === "object"
          ? (body.item as CatalogEntry)
          : null;

      if (!saved?.slug) {
        createError = "Phản hồi không hợp lệ.";
        return;
      }

      const entry = copyEntry(saved);
      if (createKind === "topic") {
        topics = [...topics, entry].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)
        );
      } else {
        moods = [...moods, entry].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug)
        );
      }

      createDialog?.close();
      notice = { slug: entry.slug, tone: "ok", text: "Đã thêm." };
    } catch {
      createError = "Không có kết nối.";
    } finally {
      creating = false;
    }
  }

  async function save() {
    const current = editing;
    const item = editingItem();
    if (!current || !item || savingSlug) return;

    const label = draftLabel.trim();
    if (!label) {
      notice = { slug: item.slug, tone: "error", text: "Hãy nhập tên hiển thị." };
      return;
    }

    savingSlug = item.slug;
    notice = null;

    try {
      const response = await fetch("/api/admin/catalog", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: current.kind,
          slug: item.slug,
          label,
          sortOrder: draftOrder
        })
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        const message =
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "Không lưu được.";
        notice = { slug: item.slug, tone: "error", text: message };
        return;
      }

      const saved =
        body &&
        typeof body === "object" &&
        "item" in body &&
        body.item &&
        typeof body.item === "object"
          ? (body.item as CatalogEntry)
          : null;

      if (saved && typeof saved.label === "string") {
        item.label = saved.label;
        item.sortOrder = saved.sortOrder;
        item.used = saved.used;
      } else {
        item.label = label;
        item.sortOrder = draftOrder;
      }

      const list = listFor(current.kind);
      list.sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.slug.localeCompare(right.slug)
      );
      if (current.kind === "topic") topics = [...list];
      else moods = [...list];

      editing = null;
      notice = { slug: item.slug, tone: "ok", text: "Đã lưu." };
    } catch {
      notice = { slug: item.slug, tone: "error", text: "Không có kết nối." };
    } finally {
      savingSlug = "";
    }
  }
</script>

<AdminShell current="catalog" onleave={leave} {pending}>
  <main class="main">
    <header class="page-head">
      <div>
        <h1>Chủ đề &amp; tâm trạng</h1>
        <p>
          Mỗi mục là một thẻ. Bấm mũi tên để đổi tên hoặc thứ tự. Thêm mục mới bằng nút
          Thêm.
        </p>
      </div>
      <button type="button" class="add-btn" onclick={openCreate}>
        + Thêm
      </button>
    </header>

    {@render catalogCards("Chủ đề", "topic-heading", "topic", topics)}
    {@render catalogCards("Tâm trạng", "mood-heading", "mood", moods)}
  </main>
</AdminShell>

<dialog
  class="create-dialog"
  bind:this={createDialog}
  aria-labelledby="create-catalog-title"
  onclose={() => {
    createError = "";
  }}
>
  <form
    class="create-sheet"
    onsubmit={(event) => {
      event.preventDefault();
      void submitCreate();
    }}
  >
    <header class="create-head">
      <h2 id="create-catalog-title">Thêm mục</h2>
      <button type="button" class="quiet" disabled={creating} onclick={closeCreate}>
        Đóng
      </button>
    </header>

    <label class="field">
      <span>Tên</span>
      <input
        maxlength="48"
        placeholder="Ví dụ: Bình yên buổi sáng"
        bind:value={createLabel}
        disabled={creating}
        required
      />
    </label>
    {#if createSlugPreview}
      <p class="slug-hint">Mã: <code>{createSlugPreview}</code></p>
    {/if}

    <p class="field-label" id="create-kind-label">Loại</p>
    <div class="kind-chips" role="group" aria-labelledby="create-kind-label">
      <button
        type="button"
        class="chip"
        aria-pressed={createKind === "topic"}
        disabled={creating}
        onclick={() => (createKind = "topic")}
      >
        Chủ đề
      </button>
      <button
        type="button"
        class="chip"
        aria-pressed={createKind === "mood"}
        disabled={creating}
        onclick={() => (createKind = "mood")}
      >
        Tâm trạng
      </button>
    </div>

    {#if createError}
      <p class="create-error" role="alert">{createError}</p>
    {/if}

    <footer class="create-actions">
      <button type="button" class="quiet" disabled={creating} onclick={closeCreate}>
        Hủy
      </button>
      <button type="submit" class="primary" disabled={creating}>
        {creating ? "Đang lưu…" : "Lưu"}
      </button>
    </footer>
  </form>
</dialog>

{#snippet catalogCards(
  title: string,
  headingId: string,
  kind: "topic" | "mood",
  items: CatalogEntry[]
)}
  <section class="panel" aria-labelledby={headingId}>
    <div class="section-head">
      <h2 id={headingId}>{title}</h2>
      <span class="count">{items.length}</span>
    </div>
    {#if items.length === 0}
      <p class="empty">Chưa có mục nào trong cơ sở dữ liệu.</p>
    {:else}
      <ul class="cards">
        {#each items as item (item.slug)}
          {@const open = editing?.kind === kind && editing.slug === item.slug}
          {@const look = lookFor(item.slug)}
          <li class:open>
            <div class="card-head">
              <span class="mark">{@render glyph(look.icon)}</span>
              {#if open}
                <div class="row-actions">
                  <button
                    type="button"
                    class="primary"
                    disabled={savingSlug === item.slug}
                    onclick={save}
                  >
                    {savingSlug === item.slug ? "Đang lưu…" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    class="quiet"
                    disabled={savingSlug === item.slug}
                    onclick={cancelEdit}
                  >
                    Hủy
                  </button>
                </div>
              {:else}
                <button
                  type="button"
                  class="arrow"
                  aria-label={`Chỉnh sửa ${item.label}`}
                  onclick={() => beginEdit(kind, item)}
                >
                  {@render glyph("arrow")}
                </button>
              {/if}
            </div>
            <div class="card-body">
              {#if open}
                <label class="field">
                  <span class="visually-hidden">Tên hiển thị</span>
                  <input bind:value={draftLabel} maxlength="48" />
                </label>
              {:else}
                <h3>{item.label}</h3>
              {/if}
              <p class="blurb">{look.blurb}</p>
              <dl class="meta">
                <div>
                  <dt>Mã</dt>
                  <dd>{item.slug}</dd>
                </div>
                <div>
                  <dt>Thứ tự</dt>
                  <dd>
                    {#if open}
                      <label class="field order">
                        <span class="visually-hidden">Thứ tự</span>
                        <input
                          type="number"
                          min="0"
                          max="999"
                          step="1"
                          bind:value={draftOrder}
                        />
                      </label>
                    {:else}
                      {item.sortOrder}
                    {/if}
                  </dd>
                </div>
                <div>
                  <dt>Bài viết</dt>
                  <dd>{item.used}</dd>
                </div>
              </dl>
              {#if notice?.slug === item.slug}
                <p class="notice {notice.tone}" role="status">{notice.text}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

{#snippet glyph(name: IconName)}
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {#if name === "leaf"}
      <path d="M5 19c7-.4 12-6.2 13.2-13.8C12.2 6.2 7 10.4 5 19z" />
      <path d="M8.2 15.6c2.2-2.4 4.6-4.4 8-6" fill="none" />
    {:else if name === "book"}
      <path d="M4.5 6.2h6.2A2.3 2.3 0 0 1 13 8.5V19H7.2A2.7 2.7 0 0 0 4.5 21.7z" fill="none" />
      <path d="M19.5 6.2h-6.2A2.3 2.3 0 0 0 11 8.5V19h5.8a2.7 2.7 0 0 1 2.7 2.7z" fill="none" />
    {:else if name === "spark"}
      <path d="M12 2.4 14.4 9.2 21.6 12 14.4 14.8 12 21.6 9.6 14.8 2.4 12 9.6 9.2z" />
    {:else if name === "sprout"}
      <path d="M12 20V11" fill="none" />
      <path d="M12 13c0-4 3.2-6.5 7-6.5 0 4-3 6.5-7 6.5z" />
      <path d="M12 14.5C12 11 9.2 8.8 5.5 8.8 5.5 12.6 8.4 14.5 12 14.5z" />
    {:else if name === "balance"}
      <circle cx="12" cy="12" r="7.2" fill="none" />
      <path d="M12 4.8a3.6 3.6 0 0 1 0 7.2 3.6 3.6 0 0 0 0 7.2" fill="none" />
    {:else if name === "sun"}
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 4.2v2.1M12 17.7v2.1M4.2 12h2.1M17.7 12h2.1M6.5 6.5l1.5 1.5M16 16l1.5 1.5M17.5 6.5 16 8M8 16l-1.5 1.5" fill="none" />
    {:else if name === "heart"}
      <path d="M12 19s-6.2-3.7-6.2-8A3.5 3.5 0 0 1 12 8.2 3.5 3.5 0 0 1 18.2 11c0 4.3-6.2 8-6.2 8z" />
    {:else if name === "bulb"}
      <path d="M9 16.5h6M10 19h4" fill="none" />
      <path d="M8.2 11a3.8 3.8 0 1 1 6.4 2.8c-.7.6-1.1 1.2-1.1 2.2h-4.9c0-1-.5-1.6-1.2-2.2A3.8 3.8 0 0 1 8.2 11z" fill="none" />
    {:else if name === "moon"}
      <path d="M15 4.8A7 7 0 1 0 19 15 5.6 5.6 0 0 1 15 4.8z" />
    {:else if name === "cloud"}
      <path d="M7.5 17.5h8.2a3.3 3.3 0 0 0 .4-6.6 4.6 4.6 0 0 0-8.8 1.2 2.8 2.8 0 0 0 .2 5.4z" />
    {:else if name === "drop"}
      <path d="M12 4.2s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9z" />
    {:else}
      <path d="M7 16.5 16.5 7M10.5 7H17v6.5" fill="none" />
    {/if}
  </svg>
{/snippet}

<style>
  .main {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6);
  }

  h1,
  h2 {
    margin: 0;
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  h1 {
    font-size: var(--text-xl);
  }

  h2 {
    font-size: var(--text-lg);
  }

  .page-head p,
  .empty {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .page-head p {
    margin-top: var(--space-2);
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

  .create-dialog {
    width: min(420px, calc(100vw - 1.5rem));
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-background);
    color: var(--color-text);
  }

  .create-dialog::backdrop {
    background: color-mix(in oklab, #0a100c 52%, transparent);
    backdrop-filter: blur(5px);
  }

  :global(html[data-theme="dark"]) .create-dialog::backdrop {
    background: color-mix(in oklab, #020403 78%, transparent);
  }

  .create-sheet {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
  }

  .create-head,
  .create-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .create-actions {
    justify-content: flex-end;
    margin-top: var(--space-2);
  }

  .slug-hint {
    margin: -0.35rem 0 0;
    color: var(--color-text-secondary);
    font-size: 0.82rem;
  }

  .slug-hint code {
    font-family: var(--font-body);
    font-weight: 650;
  }

  .field-label {
    margin: 0;
    font-size: var(--text-sm);
  }

  .kind-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .chip {
    min-height: 36px;
    padding: 0 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .chip[aria-pressed="true"] {
    border-color: transparent;
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
    font-weight: 650;
  }

  .create-error {
    margin: 0;
    color: var(--color-error);
    font-size: var(--text-sm);
  }

  .panel {
    display: grid;
    gap: var(--space-3);
  }

  .section-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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

  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .cards li {
    display: grid;
    align-content: space-between;
    gap: var(--space-8);
    min-height: 230px;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: 1.35rem;
    background: var(--color-surface);
    color: var(--color-text);
  }

  .cards li.open {
    border-color: color-mix(in oklab, var(--color-primary) 45%, transparent);
  }

  .card-head,
  .row-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .mark,
  .arrow {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    color: var(--color-primary);
  }

  .mark svg,
  .arrow svg {
    width: 26px;
    height: 26px;
    fill: currentColor;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mark svg path:not([fill="none"]) {
    stroke: none;
  }

  .arrow {
    width: 32px;
    height: 32px;
    border: 0;
    background: transparent;
    opacity: 0.55;
  }

  .arrow svg {
    width: 18px;
    height: 18px;
    fill: none;
  }

  .arrow:hover {
    opacity: 1;
  }

  h3 {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: clamp(1.55rem, 2vw, 1.9rem);
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .blurb {
    margin: var(--space-2) 0 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    margin: var(--space-5) 0 0;
  }

  .meta div {
    display: grid;
    gap: var(--space-1);
  }

  .meta dt {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .meta dd {
    margin: 0;
    font-weight: 650;
  }

  .field {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .order {
    max-width: 6.5rem;
  }

  input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font-weight: 500;
  }

  .quiet {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .primary {
    min-height: 36px;
    padding: 0 var(--space-4);
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: var(--text-sm);
  }

  .primary:disabled,
  .quiet:disabled,
  .arrow:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  .notice {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
  }

  .notice.ok {
    color: var(--color-success, var(--color-primary));
  }

  .notice.error {
    color: var(--color-error);
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

    .add-btn {
      justify-self: stretch;
      min-height: 2.75rem;
      width: 100%;
    }

    .cards {
      gap: var(--space-3);
    }
  }

  @media (max-width: 767px) {
    .main {
      padding: var(--space-3);
    }

    h1 {
      font-size: 1.25rem;
    }

    .cards {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .meta {
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2) var(--space-3);
    }

    .meta > :last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }

    .create-dialog {
      width: 100vw;
      max-width: 100vw;
      height: auto;
      max-height: 100dvh;
      margin: 0;
      border: 0;
      border-radius: 0;
      overflow: auto;
    }

    .create-sheet {
      min-height: 100dvh;
      padding: var(--space-4);
      padding-top: max(var(--space-4), env(safe-area-inset-top));
      padding-bottom: max(var(--space-4), env(safe-area-inset-bottom));
      box-sizing: border-box;
    }

    .create-actions {
      position: sticky;
      bottom: 0;
      margin-top: auto;
      padding-top: var(--space-3);
      background: linear-gradient(
        to top,
        var(--color-background) 70%,
        transparent
      );
    }

    .create-actions .primary,
    .create-actions .quiet {
      min-height: 2.75rem;
    }
  }
</style>
