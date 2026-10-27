<script lang="ts">
  import { onDestroy } from "svelte";

  import AdminShell from "./AdminShell.svelte";
  import type { PublicAdmin } from "./d1-admin-accounts";

  interface Props {
    initialAdmins: PublicAdmin[];
    pending: number;
  }

  let { initialAdmins, pending }: Props = $props();

  let admins = $state(initialAdmins.map((item) => ({ ...item })));
  let meId = $state<string | null>(null);
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(null);
  let noticeTimer = 0;
  let busyId = $state("");
  let creating = $state(false);

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
    clearTimeout(noticeTimer);
  });

  let createOpen = $state(false);
  let createUsername = $state("");
  let createDisplayName = $state("");
  let createPassword = $state("");
  let createShowPassword = $state(false);
  let createError = $state("");

  let editId = $state<string | null>(null);
  let editDisplayName = $state("");
  let editPassword = $state("");
  let editShowPassword = $state(false);
  let editError = $state("");

  async function leave() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.replace("/admin/login");
    }
  }

  async function loadMe() {
    try {
      const response = await fetch("/api/admin/me");
      const body = await response.json().catch(() => null);
      if (response.ok && body?.admin?.id) {
        meId = body.admin.id;
        try {
          sessionStorage.setItem(
            "binhyen-admin-name",
            body.admin.displayName || body.admin.username
          );
        } catch {
          // Bo qua.
        }
      }
    } catch {
      // Bo qua.
    }
  }

  void loadMe();

  function openCreate() {
    createUsername = "";
    createDisplayName = "";
    createPassword = "";
    createShowPassword = false;
    createError = "";
    createOpen = true;
  }

  function openEdit(admin: PublicAdmin) {
    editId = admin.id;
    editDisplayName = admin.displayName;
    editPassword = "";
    editShowPassword = false;
    editError = "";
  }

  function closeEdit() {
    editId = null;
    editShowPassword = false;
    editError = "";
  }

  async function submitCreate(event: SubmitEvent) {
    event.preventDefault();
    if (creating) return;
    creating = true;
    createError = "";
    notice = null;

    try {
      const response = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: createUsername.trim(),
          displayName: createDisplayName.trim() || createUsername.trim(),
          password: createPassword
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.admin) {
        createError =
          typeof body?.error === "string"
            ? body.error
            : "Không tạo được tài khoản.";
        return;
      }
      admins = [...admins, body.admin as PublicAdmin];
      createOpen = false;
      flashNotice("ok", "Đã thêm quản trị viên.");
    } catch {
      createError = "Không có kết nối.";
    } finally {
      creating = false;
    }
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
        `/api/admin/admins/${encodeURIComponent(editId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.admin) {
        editError =
          typeof body?.error === "string"
            ? body.error
            : "Không lưu được.";
        return;
      }
      const saved = body.admin as PublicAdmin;
      admins = admins.map((item) => (item.id === saved.id ? saved : item));
      if (meId === saved.id) {
        try {
          sessionStorage.setItem("binhyen-admin-name", saved.displayName);
        } catch {
          // Bo qua.
        }
      }
      closeEdit();
      flashNotice("ok", "Đã cập nhật tài khoản.");
    } catch {
      editError = "Không có kết nối.";
    } finally {
      busyId = "";
    }
  }

  async function setStatus(admin: PublicAdmin, status: "active" | "disabled") {
    if (busyId) return;
    busyId = admin.id;
    notice = null;
    try {
      const response = await fetch(
        `/api/admin/admins/${encodeURIComponent(admin.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status })
        }
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.admin) {
        notice = {
          tone: "error",
          text:
            typeof body?.error === "string"
              ? body.error
              : "Không đổi được trạng thái."
        };
        return;
      }
      const saved = body.admin as PublicAdmin;
      admins = admins.map((item) => (item.id === saved.id ? saved : item));
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

<AdminShell current="admins" onleave={leave} {pending}>
  <main class="main">
    <header class="page-head">
      <div>
        <h1>Quản trị viên</h1>
        <p>Tài khoản vận hành — tách biệt với người dùng sản phẩm.</p>
      </div>
      <button type="button" class="add-btn" onclick={openCreate}>
        + Thêm admin
      </button>
    </header>

    {#if notice}
      <p class="notice" class:ok={notice.tone === "ok"} class:err={notice.tone === "error"} role="status">
        {notice.text}
      </p>
    {/if}

    {#if admins.length === 0}
      <p class="empty">
        Chưa có admin trong DB. Đăng nhập lần đầu bằng tài khoản env để tạo bản ghi đầu tiên.
      </p>
    {:else}
      <ul class="cards">
        {#each admins as admin (admin.id)}
          <li class:is-disabled={admin.status === "disabled"}>
            <div class="card-top">
              <span class="avatar" aria-hidden="true"
                >{admin.displayName.charAt(0).toLocaleUpperCase("vi")}</span
              >
              <div class="who">
                <div class="title-row">
                  <strong>{admin.displayName}</strong>
                  <span class="status" data-status={admin.status}>
                    {admin.status === "active" ? "Hoạt động" : "Đã khóa"}
                  </span>
                </div>
                <span class="sub">@{admin.username}</span>
              </div>
            </div>

            {#if editId === admin.id}
              <form class="edit" onsubmit={submitEdit}>
                <label>
                  Tên hiển thị
                  <input
                    bind:value={editDisplayName}
                    maxlength="60"
                    required
                    disabled={busyId === admin.id}
                  />
                </label>
                <label>
                  Mật khẩu mới
                  <div class="password-field">
                    <input
                      type={editShowPassword ? "text" : "password"}
                      bind:value={editPassword}
                      minlength="12"
                      maxlength="200"
                      placeholder="Để trống nếu giữ nguyên"
                      disabled={busyId === admin.id}
                      autocomplete="new-password"
                    />
                    <button
                      type="button"
                      class="reveal"
                      aria-pressed={editShowPassword}
                      aria-label={editShowPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      disabled={busyId === admin.id}
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
                  <button type="submit" class="primary" disabled={busyId === admin.id}>
                    {busyId === admin.id ? "Đang lưu…" : "Lưu"}
                  </button>
                  <button
                    type="button"
                    class="quiet"
                    disabled={busyId === admin.id}
                    onclick={closeEdit}
                  >
                    Hủy
                  </button>
                </div>
              </form>
            {:else}
              <div class="meta">
                <span>Tạo {dateLabel(admin.createdAt)}</span>
                {#if meId === admin.id}
                  <span class="you">Bạn</span>
                {/if}
              </div>
              <div class="row-actions">
                <button
                  type="button"
                  class="quiet"
                  disabled={Boolean(busyId)}
                  onclick={() => openEdit(admin)}
                >
                  Sửa
                </button>
                {#if admin.status === "active"}
                  <button
                    type="button"
                    class="danger"
                    disabled={Boolean(busyId) || meId === admin.id}
                    onclick={() => void setStatus(admin, "disabled")}
                  >
                    Khóa
                  </button>
                {:else}
                  <button
                    type="button"
                    class="quiet"
                    disabled={Boolean(busyId)}
                    onclick={() => void setStatus(admin, "active")}
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
  </main>
</AdminShell>

{#if createOpen}
  <div class="scrim" role="presentation" onclick={() => (createOpen = false)}></div>
  <form class="sheet" onsubmit={submitCreate}>
    <header>
      <h2>Thêm quản trị viên</h2>
      <button type="button" class="quiet" onclick={() => (createOpen = false)}>
        Đóng
      </button>
    </header>
    <label>
      Tên đăng nhập
      <input
        bind:value={createUsername}
        maxlength="40"
        required
        pattern={"[A-Za-z0-9._-]{3,40}"}
        disabled={creating}
        autocomplete="off"
      />
    </label>
    <label>
      Tên hiển thị
      <input
        bind:value={createDisplayName}
        maxlength="60"
        disabled={creating}
        placeholder="Mặc định = tên đăng nhập"
      />
    </label>
    <label>
      Mật khẩu
      <div class="password-field">
        <input
          type={createShowPassword ? "text" : "password"}
          bind:value={createPassword}
          minlength="12"
          maxlength="200"
          required
          disabled={creating}
          autocomplete="new-password"
        />
        <button
          type="button"
          class="reveal"
          aria-pressed={createShowPassword}
          aria-label={createShowPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          disabled={creating}
          onclick={() => (createShowPassword = !createShowPassword)}
        >
          {createShowPassword ? "Ẩn" : "Hiện"}
        </button>
      </div>
    </label>
    {#if createError}
      <p class="form-error" role="alert">{createError}</p>
    {/if}
    <button type="submit" class="primary" disabled={creating}>
      {creating ? "Đang tạo…" : "Tạo tài khoản"}
    </button>
  </form>
{/if}

<style>
  .main {
    display: grid;
    align-content: start;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6);
    padding-bottom: max(var(--space-6), env(safe-area-inset-bottom));
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
    margin: var(--space-2) 0 0;
    max-width: 36rem;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .add-btn,
  .primary {
    min-height: 2.5rem;
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

  .add-btn {
    flex: 0 0 auto;
    white-space: nowrap;
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
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
  }

  .you {
    color: var(--color-primary);
    font-weight: 650;
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .quiet,
  .danger {
    min-height: 2.25rem;
    padding: 0 0.85rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .danger {
    border-color: color-mix(in oklab, #c45c5c 35%, var(--color-border));
    color: #c45c5c;
  }

  .edit,
  .sheet {
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

  input {
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

  .reveal:hover:not(:disabled) {
    color: var(--color-primary);
  }

  .reveal:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: color-mix(in oklab, #0a100c 48%, transparent);
  }

  .sheet {
    position: fixed;
    z-index: 70;
    top: 50%;
    left: 50%;
    width: min(24rem, calc(100vw - 2rem));
    max-height: min(92dvh, 40rem);
    overflow: auto;
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    transform: translate(-50%, -50%);
    box-shadow: 0 18px 48px color-mix(in oklab, #000 18%, transparent);
  }

  .sheet header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
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

    .page-head {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-3);
    }

    .add-btn {
      width: 100%;
      min-height: 2.75rem;
    }

    h1 {
      font-size: 1.25rem;
    }

    .page-head p,
    .empty {
      font-size: 0.82rem;
      line-height: 1.4;
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

    .sheet {
      top: auto;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-height: min(92dvh, 100%);
      padding: var(--space-4);
      padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      transform: none;
      box-shadow: 0 -12px 40px color-mix(in oklab, #000 16%, transparent);
    }

    .sheet .primary {
      min-height: 2.75rem;
      width: 100%;
    }
  }
</style>
