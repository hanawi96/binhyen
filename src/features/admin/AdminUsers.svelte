<script lang="ts">
  import { onDestroy } from "svelte";

  import type { UserStatus } from "../account/account";
  import AdminShell from "./AdminShell.svelte";
  import type { AdminUserListItem } from "./d1-admin-users";

  interface Props {
    initialItems: AdminUserListItem[];
    initialCursor: string | null;
    initialTotal: number;
    pending: number;
  }

  let { initialItems, initialCursor, initialTotal, pending }: Props = $props();

  const PAGE_SIZE = 12;

  let items = $state(initialItems.map((item) => ({ ...item })));
  let total = $state(initialTotal);
  let pageCursors = $state<(string | null)[]>(
    initialCursor ? [null, initialCursor] : [null]
  );
  let pageIndex = $state(0);
  let query = $state("");
  let statusFilter = $state<"all" | UserStatus>("all");
  let listLoading = $state(false);
  let listError = $state("");
  let listTicket = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(null);
  let noticeTimer = 0;
  let busyId = $state("");

  let editId = $state<string | null>(null);
  let editDisplayName = $state("");
  let editPassword = $state("");
  let editShowPassword = $state(false);
  let editError = $state("");

  let resultLabel = $derived.by(() => {
    if (total === 0) return "0 kết quả";
    const from = pageIndex * PAGE_SIZE + 1;
    const to = pageIndex * PAGE_SIZE + items.length;
    return `${from}–${to} / ${total} kết quả`;
  });

  function flashNotice(tone: "ok" | "error", text: string) {
    clearTimeout(noticeTimer);
    notice = { tone, text };
    if (tone === "ok") {
      noticeTimer = window.setTimeout(() => {
        notice = null;
      }, 2000);
    }
  }

  onDestroy(() => {
    clearTimeout(searchTimer);
    clearTimeout(noticeTimer);
  });

  async function leave() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.replace("/admin/login");
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

  async function loadList(): Promise<boolean> {
    const ticket = ++listTicket;
    listLoading = true;
    listError = "";
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    if (statusFilter !== "all") params.set("status", statusFilter);
    const term = query.trim();
    if (term) params.set("q", term);

    const cursor = pageCursors[pageIndex];
    if (cursor) {
      params.set("cursor", cursor);
      params.set("counts", "0");
    }

    try {
      const response = await fetch(`/api/admin/users?${params}`);
      const body = await response.json().catch(() => null);
      if (ticket !== listTicket) return false;

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return false;
      }

      if (!response.ok || !body?.success || !Array.isArray(body.items)) {
        listError =
          typeof body?.error === "string"
            ? body.error
            : "Không tải được danh sách.";
        return false;
      }

      items = body.items as AdminUserListItem[];
      if (typeof body.total === "number") total = body.total;
      storeNext(
        typeof body.nextCursor === "string" ? body.nextCursor : null
      );
      return true;
    } catch {
      if (ticket !== listTicket) return false;
      listError = "Không có kết nối.";
      return false;
    } finally {
      if (ticket === listTicket) listLoading = false;
    }
  }

  function scheduleSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      resetPages();
      void loadList();
    }, 200);
  }

  function chooseStatus(next: "all" | UserStatus) {
    if (statusFilter === next) return;
    statusFilter = next;
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

  function openEdit(user: AdminUserListItem) {
    editId = user.id;
    editDisplayName = user.displayName;
    editPassword = "";
    editShowPassword = false;
    editError = "";
  }

  function closeEdit() {
    editId = null;
    editShowPassword = false;
    editError = "";
  }

  async function submitEdit(event: SubmitEvent) {
    event.preventDefault();
    if (!editId || busyId) return;
    busyId = editId;
    editError = "";
    notice = null;

    const payload: Record<string, string> = {
      displayName: editDisplayName.trim()
    };
    if (editPassword) payload.password = editPassword;

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(editId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.user) {
        editError =
          typeof body?.error === "string" ? body.error : "Không lưu được.";
        return;
      }
      const saved = body.user as AdminUserListItem;
      items = items.map((item) => (item.id === saved.id ? saved : item));
      closeEdit();
      flashNotice("ok", "Đã cập nhật người dùng.");
    } catch {
      editError = "Không có kết nối.";
    } finally {
      busyId = "";
    }
  }

  async function setStatus(user: AdminUserListItem, status: UserStatus) {
    if (busyId) return;
    busyId = user.id;
    notice = null;
    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status })
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.user) {
        notice = {
          tone: "error",
          text:
            typeof body?.error === "string"
              ? body.error
              : "Không đổi được trạng thái."
        };
        return;
      }
      const saved = body.user as AdminUserListItem;
      items = items.map((item) => (item.id === saved.id ? saved : item));
      flashNotice(
        "ok",
        status === "disabled" ? "Đã khóa tài khoản." : "Đã mở lại."
      );
    } catch {
      notice = { tone: "error", text: "Không có kết nối." };
    } finally {
      busyId = "";
    }
  }

  function dateLabel(epoch: number): string {
    return new Date(epoch * 1000).toLocaleDateString("vi-VN");
  }
</script>

<AdminShell current="users" onleave={leave} {pending}>
  <main class="main">
    <header class="page-head">
      <div>
        <h1>Người dùng</h1>
        <p>Tìm, khóa/mở và chỉnh tên hoặc mật khẩu.</p>
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

    <div class="toolbar">
      <label class="search">
        <span class="visually-hidden">Tìm email hoặc tên</span>
        <input
          type="search"
          placeholder="Tìm email hoặc tên…"
          bind:value={query}
          oninput={scheduleSearch}
        />
      </label>
      <div class="filters" role="group" aria-label="Trạng thái">
        <button
          type="button"
          class:is-active={statusFilter === "all"}
          onclick={() => chooseStatus("all")}
        >
          Tất cả
        </button>
        <button
          type="button"
          class:is-active={statusFilter === "active"}
          onclick={() => chooseStatus("active")}
        >
          Hoạt động
        </button>
        <button
          type="button"
          class:is-active={statusFilter === "disabled"}
          onclick={() => chooseStatus("disabled")}
        >
          Đã khóa
        </button>
      </div>
    </div>

    <p class="result-line" aria-live="polite">{resultLabel}</p>

    {#if listError}
      <p class="empty">{listError}</p>
    {:else if items.length === 0 && listLoading}
      <p class="empty">Đang tải…</p>
    {:else if items.length === 0}
      <p class="empty">Không có người dùng khớp.</p>
    {:else}
      <ul class="cards" aria-busy={listLoading}>
        {#each items as user (user.id)}
          <li class:is-disabled={user.status === "disabled"}>
            <div class="card-top">
              <span class="avatar" aria-hidden="true"
                >{user.displayName.charAt(0).toLocaleUpperCase("vi")}</span
              >
              <div class="who">
                <div class="title-row">
                  <strong>{user.displayName}</strong>
                  <span class="status" data-status={user.status}>
                    {user.status === "active" ? "Hoạt động" : "Đã khóa"}
                  </span>
                </div>
                <span class="sub">{user.email}</span>
              </div>
            </div>

            {#if editId === user.id}
              <form class="edit" onsubmit={submitEdit}>
                <label>
                  Tên hiển thị
                  <input
                    bind:value={editDisplayName}
                    maxlength="60"
                    required
                    disabled={busyId === user.id}
                  />
                </label>
                <label>
                  Mật khẩu mới
                  <div class="password-field">
                    <input
                      type={editShowPassword ? "text" : "password"}
                      bind:value={editPassword}
                      minlength="8"
                      maxlength="200"
                      placeholder="Để trống nếu giữ nguyên"
                      disabled={busyId === user.id}
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="reveal"
                      aria-pressed={editShowPassword}
                      aria-label={editShowPassword
                        ? "Ẩn mật khẩu"
                        : "Hiện mật khẩu"}
                      disabled={busyId === user.id}
                      onclick={() => (editShowPassword = !editShowPassword)}
                    >
                      {editShowPassword ? "Ẩn" : "Hiện"}
                    </button>
                  </div>
                </label>
                {#if editError}
                  <p class="form-error" role="alert">{editError}</p>
                {/if}
                <div class="row-actions">
                  <button
                    type="submit"
                    class="primary"
                    disabled={busyId === user.id}
                  >
                    {busyId === user.id ? "Đang lưu…" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    class="quiet"
                    disabled={busyId === user.id}
                    onclick={closeEdit}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            {:else}
              <div class="meta">
                <span>Tham gia {dateLabel(user.createdAt)}</span>
              </div>
              <div class="row-actions">
                <button
                  type="button"
                  class="quiet"
                  disabled={Boolean(busyId)}
                  onclick={() => openEdit(user)}
                >
                  Sửa
                </button>
                {#if user.status === "active"}
                  <button
                    type="button"
                    class="danger"
                    disabled={Boolean(busyId)}
                    onclick={() => void setStatus(user, "disabled")}
                  >
                    Khóa
                  </button>
                {:else}
                  <button
                    type="button"
                    class="quiet"
                    disabled={Boolean(busyId)}
                    onclick={() => void setStatus(user, "active")}
                  >
                    Mở lại
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if pageIndex > 0 || pageCursors[pageIndex + 1]}
      <div class="pager">
        <button
          type="button"
          class="quiet"
          disabled={listLoading || pageIndex === 0}
          onclick={goPrev}
        >
          Trước
        </button>
        <button
          type="button"
          class="quiet"
          disabled={listLoading || !pageCursors[pageIndex + 1]}
          onclick={goNext}
        >
          Sau
        </button>
      </div>
    {/if}
  </main>
</AdminShell>

<style>
  .main {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6);
    padding-bottom: max(var(--space-6), env(safe-area-inset-bottom));
  }

  .page-head > div {
    min-width: 0;
    flex: 1 1 auto;
  }

  h1 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  .page-head p,
  .empty,
  .result-line {
    margin: var(--space-2) 0 0;
    max-width: 36rem;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .result-line {
    margin: 0;
  }

  .notice {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .notice.ok {
    background: color-mix(in srgb, var(--color-success) 12%, transparent);
    color: var(--color-success);
  }

  .notice.err,
  .form-error {
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
  }

  .form-error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .toolbar {
    display: grid;
    gap: var(--space-3);
  }

  .search input {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.6rem 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    box-sizing: border-box;
  }

  .filters {
    display: flex;
    gap: var(--space-2);
    overflow-x: auto;
    padding-bottom: 0.15rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .filters::-webkit-scrollbar {
    display: none;
  }

  .filters button {
    flex: 0 0 auto;
    min-height: 2.25rem;
    padding: 0 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .filters button.is-active {
    border-color: transparent;
    background: var(--color-theme-peace);
    color: var(--color-accent-peace);
  }

  .cards {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr));
  }

  .cards > li {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .cards > li.is-disabled {
    opacity: 0.72;
  }

  .card-top {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--space-3);
    align-items: start;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: var(--radius-full);
    background: color-mix(in oklab, var(--color-primary) 18%, transparent);
    color: var(--color-primary);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .who {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.5rem;
    min-width: 0;
  }

  .title-row strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.98rem;
  }

  .sub {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .status {
    flex: 0 0 auto;
    padding: 0.18rem 0.55rem;
    border-radius: var(--radius-full);
    background: var(--color-surface-soft);
    color: var(--color-text-secondary);
    font-size: 0.7rem;
    font-weight: 650;
    line-height: 1.2;
  }

  .status[data-status="active"] {
    color: var(--color-success);
  }

  .meta {
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .quiet,
  .danger,
  .primary {
    min-height: 2.25rem;
    padding: 0 0.85rem;
    border-radius: var(--radius-full);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .quiet {
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
  }

  .danger {
    border: 1px solid color-mix(in oklab, #c45c5c 35%, var(--color-border));
    background: transparent;
    color: #c45c5c;
  }

  .primary {
    border: 0;
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .edit {
    display: grid;
    gap: var(--space-3);
  }

  label {
    display: grid;
    gap: var(--space-1);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .edit input {
    width: 100%;
    min-height: 2.75rem;
    padding: 0.6rem 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-background);
    color: var(--color-text);
    font: inherit;
    box-sizing: border-box;
  }

  .password-field {
    position: relative;
  }

  .password-field input {
    padding-inline-end: 3.75rem;
  }

  .reveal {
    position: absolute;
    top: 50%;
    right: 0.35rem;
    min-height: 2rem;
    padding: 0 0.65rem;
    border: 0;
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 0.78rem;
    font-weight: 650;
    transform: translateY(-50%);
    cursor: pointer;
  }

  .pager {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (max-width: 1023px) {
    .main {
      padding: var(--space-4);
      padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
    }
  }

  @media (max-width: 767px) {
    .main {
      gap: var(--space-3);
      padding: var(--space-3);
      padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
    }

    h1 {
      font-size: 1.25rem;
    }

    .page-head p,
    .empty,
    .result-line {
      font-size: 0.82rem;
      line-height: 1.4;
    }

    .toolbar {
      gap: var(--space-2);
    }

    .search input {
      min-height: 2.75rem;
    }

    .filters button {
      min-height: 2.35rem;
    }

    .cards {
      gap: var(--space-2);
      grid-template-columns: 1fr;
    }

    .cards > li {
      gap: var(--space-2);
      padding: var(--space-3);
      border-radius: var(--radius-md);
    }

    .avatar {
      width: 2.25rem;
      height: 2.25rem;
      font-size: 0.85rem;
    }

    .row-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .row-actions .primary,
    .row-actions .quiet,
    .row-actions .danger {
      min-height: 2.5rem;
      width: 100%;
    }

    .pager {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    .pager .quiet {
      min-height: 2.75rem;
      width: 100%;
    }
  }
</style>
