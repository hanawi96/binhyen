<script lang="ts">
  import type { ContentStatus } from "../content/content.types";
  import type { Submission, SubmissionCounts } from "./d1-submissions";
  import AdminShell from "../admin/AdminShell.svelte";

  interface Props {
    initialItems: Submission[];
    initialCursor: string | null;
    initialCounts: SubmissionCounts;
  }

  let { initialItems, initialCursor, initialCounts }: Props = $props();

  const tabs: Array<{ key: ContentStatus; label: string }> = [
    { key: "draft", label: "Chờ duyệt" },
    { key: "published", label: "Đã duyệt" },
    { key: "archived", label: "Đã từ chối" }
  ];
  const EMPTY: Record<ContentStatus, string> = {
    draft: "Không có bài nào đang chờ duyệt.",
    published: "Chưa duyệt bài nào.",
    archived: "Chưa từ chối bài nào."
  };
  const when = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  let status = $state<ContentStatus>("draft");
  let items = $state<Submission[]>(initialItems);
  let next = $state<string | null>(initialCursor);
  let counts = $state<SubmissionCounts>(initialCounts);
  let loading = $state(false);
  let busyId = $state("");
  let rejecting = $state("");
  let reason = $state("");
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(null);
  let serial = 0;

  function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  }

  function errorText(body: unknown, fallback: string): string {
    const error = record(body)?.error;
    return typeof error === "string" ? error : fallback;
  }

  function loseAccess() {
    window.location.replace("/admin/login");
  }

  async function load(target: ContentStatus, cursor: string | null) {
    const mine = ++serial;
    loading = true;

    const params = new URLSearchParams({ status: target });
    if (cursor) params.set("cursor", cursor);

    try {
      const response = await fetch(`/api/admin/submissions?${params}`);
      const body: unknown = await response.json().catch(() => null);
      if (mine !== serial) return;

      if (response.status === 401) return loseAccess();

      const row = record(body);
      if (!response.ok || !row || !Array.isArray(row.items)) {
        notice = {
          tone: "error",
          text: errorText(body, "Không tải được danh sách.")
        };
        return;
      }

      const page = row.items as Submission[];
      items = cursor ? [...items, ...page] : page;
      next = typeof row.nextCursor === "string" ? row.nextCursor : null;

      const fresh = record(row.counts);
      if (fresh) counts = fresh as unknown as SubmissionCounts;
    } catch {
      if (mine === serial) {
        notice = { tone: "error", text: "Không có kết nối." };
      }
    } finally {
      if (mine === serial) loading = false;
    }
  }

  function chooseTab(key: ContentStatus) {
    if (key === status && !loading) return;
    status = key;
    items = [];
    next = null;
    notice = null;
    void load(key, null);
  }

  function startReject(item: Submission) {
    rejecting = item.id;
    reason = "";
    notice = null;
  }

  async function move(item: Submission, to: ContentStatus, note = "") {
    if (busyId) return;

    if (
      to === "draft" &&
      !confirm(`Gỡ «${item.title}» khỏi trang chủ? Bài quay về Chờ duyệt.`)
    ) {
      return;
    }

    busyId = item.id;
    notice = null;

    try {
      const response = await fetch(`/api/admin/contents/${item.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          to === "archived" ? { status: to, note } : { status: to }
        )
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) return loseAccess();

      if (!response.ok) {
        notice = {
          tone: "error",
          text: errorText(body, "Không đổi được trạng thái.")
        };
        return;
      }

      items = items.filter((entry) => entry.id !== item.id);
      rejecting = "";
      counts = {
        ...counts,
        [item.status]: Math.max(0, counts[item.status] - 1),
        [to]: counts[to] + 1
      };
      notice = {
        tone: "ok",
        text:
          to === "published"
            ? `Đã duyệt «${item.title}». Bài đã lên trang chủ.`
            : to === "archived"
              ? `Đã từ chối «${item.title}».`
              : `Đã gỡ «${item.title}» khỏi trang chủ.`
      };
    } catch {
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      busyId = "";
    }
  }

  async function leave() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } catch {
      // Cookie het han van dua ve trang dang nhap.
    }

    window.location.replace("/admin/login");
  }
</script>

<AdminShell current="submissions" onleave={leave} pending={counts.draft}>
    <main class="main">
      <header class="page-head">
        <h1>Bài người dùng gửi</h1>
        <p>
          Bài người dùng viết chỉ hiện trên trang chủ sau khi bạn duyệt. Từ chối
          thì bài bị ẩn hẳn.
        </p>
      </header>

      <div class="tabs" role="tablist" aria-label="Trạng thái">
        {#each tabs as tab (tab.key)}
          <button
            type="button"
            role="tab"
            class="tab"
            class:active={tab.key === status}
            aria-selected={tab.key === status}
            onclick={() => chooseTab(tab.key)}
          >
            {tab.label}
            <span class="count">{counts[tab.key]}</span>
          </button>
        {/each}
      </div>

      {#if notice}
        <p class="notice {notice.tone}" role="status">{notice.text}</p>
      {/if}

      {#if items.length === 0 && loading}
        <p class="empty">Đang tải…</p>
      {:else if items.length === 0}
        <p class="empty">{EMPTY[status]}</p>
      {:else}
        <ul class="list">
          {#each items as item (item.id)}
            <li class="card">
              <p class="meta">
                <span>{item.category}</span>
                <span>· {item.authorName}</span>
                <span>· gửi {when.format(item.createdAt * 1000)}</span>
                {#if item.editedAt}
                  <span class="edited">
                    · sửa lần cuối {when.format(item.editedAt * 1000)}
                  </span>
                {/if}
              </p>
              <h2>{item.title}</h2>
              {#if item.description}
                <p class="description">{item.description}</p>
              {/if}
              {#if item.body}
                <details>
                  <summary>Đọc nội dung</summary>
                  <p class="body">{item.body}</p>
                </details>
              {/if}
              {#if item.topics.length > 0}
                <ul class="topics" aria-label="Chủ đề">
                  {#each item.topics as topic (topic)}
                    <li>{topic}</li>
                  {/each}
                </ul>
              {/if}

              {#if item.status === "draft" && rejecting === item.id}
                <form
                  class="reject"
                  onsubmit={(event) => {
                    event.preventDefault();
                    void move(item, "archived", reason);
                  }}
                >
                  <label for="reason-{item.id}">
                    Lý do từ chối (không bắt buộc, người viết sẽ thấy)
                  </label>
                  <textarea
                    id="reason-{item.id}"
                    rows="2"
                    maxlength="300"
                    placeholder="Ví dụ: Nội dung trùng với một bài đã có."
                    bind:value={reason}
                  ></textarea>
                  <div class="actions">
                    <button
                      type="submit"
                      class="danger"
                      disabled={busyId !== ""}
                    >
                      {busyId === item.id ? "Đang lưu…" : "Từ chối bài"}
                    </button>
                    <button
                      type="button"
                      class="quiet"
                      disabled={busyId !== ""}
                      onclick={() => (rejecting = "")}
                    >
                      Huỷ
                    </button>
                    <span class="state">Bài sẽ bị ẩn, không mở lại được.</span>
                  </div>
                </form>
              {:else}
                <div class="actions">
                  {#if item.status === "draft"}
                    <button
                      type="button"
                      class="primary"
                      disabled={busyId !== ""}
                      onclick={() => move(item, "published")}
                    >
                      {busyId === item.id ? "Đang lưu…" : "Duyệt & đăng"}
                    </button>
                    <button
                      type="button"
                      class="quiet"
                      disabled={busyId !== ""}
                      onclick={() => startReject(item)}
                    >
                      Từ chối
                    </button>
                  {:else if item.status === "published"}
                    <span class="state">
                      Đang hiện trên trang chủ{item.publishedAt
                        ? ` từ ${when.format(item.publishedAt * 1000)}`
                        : ""}
                    </span>
                    <button
                      type="button"
                      class="quiet"
                      disabled={busyId !== ""}
                      onclick={() => move(item, "draft")}
                    >
                      Gỡ xuống
                    </button>
                  {:else}
                    <span class="state">
                      {item.note
                        ? `Lý do từ chối: ${item.note}`
                        : "Đã từ chối, không ghi lý do."}
                    </span>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>

        {#if next}
          <button
            type="button"
            class="more"
            disabled={loading}
            onclick={() => load(status, next)}
          >
            {loading ? "Đang tải…" : "Xem thêm"}
          </button>
        {/if}
      {/if}
    </main>
</AdminShell>

<style>
  .main {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
    max-width: 860px;
    padding: var(--space-6);
  }

  h1 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  .page-head p,
  .empty {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .page-head p {
    margin-top: var(--space-2);
  }

  .tabs {
    display: flex;
    gap: var(--space-2);
    border-bottom: 1px solid var(--color-border);
  }

  .tab {
    margin-bottom: -1px;
    padding: var(--space-3) var(--space-2);
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .tab.active {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: 600;
  }

  .count {
    margin-left: var(--space-1);
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .notice {
    margin: 0;
    font-size: var(--text-sm);
  }

  .notice.ok {
    color: var(--color-success);
  }

  .notice.error {
    color: var(--color-error);
  }

  .list {
    display: grid;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: 1.2rem;
    background: var(--color-surface);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-xs);
  }

  .meta .edited {
    color: var(--color-primary);
    font-weight: 600;
  }

  .meta span:first-child {
    color: var(--color-eyebrow);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-family: var(--font-editorial);
    font-size: clamp(1.35rem, 2vw, 1.65rem);
    font-weight: 500;
    line-height: 1.3;
  }

  .description {
    margin: 0;
    color: var(--color-text-secondary);
  }

  details summary {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .body {
    margin: var(--space-3) 0 0;
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-soft);
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .topics li {
    padding: 2px var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  .primary {
    min-height: 38px;
    padding: 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .quiet,
  .more {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .more {
    justify-self: center;
    padding: var(--space-3);
  }

  .primary:disabled,
  .quiet:disabled,
  .more:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  .state {
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    overflow-wrap: anywhere;
  }

  .reject {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-surface-soft);
  }

  .reject label {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .reject textarea {
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    resize: vertical;
  }

  .reject .actions {
    margin-top: 0;
  }

  .danger {
    min-height: 38px;
    padding: 0 var(--space-5);
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-error);
    color: var(--color-surface);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .danger:disabled {
    cursor: progress;
    opacity: 0.6;
  }

  @media (max-width: 1023px) {
    .main {
      gap: var(--space-4);
      padding: var(--space-4);
      max-width: none;
    }

    .tabs {
      flex-wrap: wrap;
      gap: 0;
    }

    .tab {
      flex: 1 1 auto;
      text-align: center;
      padding: var(--space-3) var(--space-2);
    }
  }

  @media (max-width: 767px) {
    .main {
      padding: var(--space-3);
      gap: var(--space-3);
    }

    h1 {
      font-size: 1.25rem;
    }

    .page-head p {
      font-size: 0.82rem;
    }

    .list {
      gap: var(--space-3);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .actions .primary,
    .actions .quiet {
      width: 100%;
      min-height: 2.75rem;
      justify-content: center;
    }
  }
</style>
