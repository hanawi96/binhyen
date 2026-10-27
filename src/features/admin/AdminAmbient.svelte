<script lang="ts">
  import type { AmbientTrackRow } from "../ambient/d1-ambient-tracks";
  import AdminShell from "./AdminShell.svelte";

  interface Props {
    initialTracks: AmbientTrackRow[];
    pending: number;
  }

  let { initialTracks, pending }: Props = $props();

  let tracks = $state(initialTracks.map((t) => ({ ...t })));
  let title = $state("");
  let file = $state<File | null>(null);
  let makeDefault = $state(false);
  let busy = $state(false);
  let dragOver = $state(false);
  let notice = $state<{ tone: "ok" | "error"; text: string } | null>(null);
  let renameId = $state<string | null>(null);
  let renameDraft = $state("");
  let fileInput = $state<HTMLInputElement | null>(null);

  const fileLabel = $derived(
    file
      ? `${file.name} · ${formatBytes(file.size)}`
      : "Kéo thả file vào đây, hoặc bấm để chọn"
  );

  async function leave() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.replace("/admin/login");
    }
  }

  function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function acceptFile(next: File | null | undefined) {
    if (!next) return;
    if (!next.type.startsWith("audio/") && !/\.(mp3|ogg|m4a|webm)$/i.test(next.name)) {
      notice = { tone: "error", text: "Chỉ nhận file nhạc (MP3, OGG, M4A, WebM)." };
      return;
    }
    file = next;
    if (!title.trim()) {
      title = next.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    }
    notice = null;
  }

  function onFileChange(event: Event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    acceptFile(input.files?.[0]);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragOver = false;
    if (busy) return;
    acceptFile(event.dataTransfer?.files?.[0]);
  }

  function clearFile() {
    file = null;
    if (fileInput) fileInput.value = "";
  }

  async function upload() {
    if (busy) return;
    const name = title.trim();
    if (!name) {
      notice = { tone: "error", text: "Nhập tên bài." };
      return;
    }
    if (!file) {
      notice = { tone: "error", text: "Chọn tệp nhạc trước." };
      return;
    }

    busy = true;
    notice = null;
    const form = new FormData();
    form.set("title", name);
    form.set("file", file);
    if (makeDefault) form.set("makeDefault", "1");

    try {
      const response = await fetch("/api/admin/ambient/tracks", {
        method: "POST",
        body: form
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }

      if (!response.ok) {
        notice = {
          tone: "error",
          text: readError(body, "Không tải lên được.")
        };
        return;
      }

      const track = readTrack(body);
      if (!track) {
        notice = { tone: "error", text: "Phản hồi không hợp lệ." };
        return;
      }

      if (track.isDefault) {
        tracks = tracks.map((item) => ({ ...item, isDefault: false }));
      }
      tracks = [...tracks, track];
      title = "";
      makeDefault = false;
      clearFile();
      notice = { tone: "ok", text: "Đã thêm bài nhạc." };
    } catch {
      notice = { tone: "error", text: "Lỗi mạng khi tải lên." };
    } finally {
      busy = false;
    }
  }

  async function setDefault(id: string) {
    if (busy) return;
    busy = true;
    notice = null;
    try {
      const response = await fetch(`/api/admin/ambient/tracks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ makeDefault: true })
      });
      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        notice = {
          tone: "error",
          text: readError(body, "Không đặt mặc định được.")
        };
        return;
      }
      tracks = tracks.map((item) => ({
        ...item,
        isDefault: item.id === id
      }));
      notice = { tone: "ok", text: "Đã đặt bài mặc định." };
    } catch {
      notice = { tone: "error", text: "Lỗi mạng." };
    } finally {
      busy = false;
    }
  }

  function startRename(track: AmbientTrackRow) {
    renameId = track.id;
    renameDraft = track.title;
  }

  async function saveRename() {
    if (!renameId || busy) return;
    const next = renameDraft.trim();
    if (!next) {
      notice = { tone: "error", text: "Tên không được trống." };
      return;
    }
    busy = true;
    notice = null;
    try {
      const response = await fetch(`/api/admin/ambient/tracks/${renameId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: next })
      });
      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        notice = {
          tone: "error",
          text: readError(body, "Không đổi tên được.")
        };
        return;
      }
      const id = renameId;
      tracks = tracks.map((item) =>
        item.id === id ? { ...item, title: next } : item
      );
      renameId = null;
      notice = { tone: "ok", text: "Đã đổi tên." };
    } catch {
      notice = { tone: "error", text: "Lỗi mạng." };
    } finally {
      busy = false;
    }
  }

  async function remove(id: string, label: string) {
    if (busy) return;
    if (!window.confirm(`Xóa bài “${label}”? File trên R2 cũng sẽ bị xóa.`)) {
      return;
    }
    busy = true;
    notice = null;
    try {
      const response = await fetch(`/api/admin/ambient/tracks/${id}`, {
        method: "DELETE"
      });
      if (response.status === 401) {
        window.location.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        notice = {
          tone: "error",
          text: readError(body, "Không xóa được.")
        };
        return;
      }
      tracks = tracks.filter((item) => item.id !== id);
      notice = { tone: "ok", text: "Đã xóa." };
    } catch {
      notice = { tone: "error", text: "Lỗi mạng." };
    } finally {
      busy = false;
    }
  }

  function readError(body: unknown, fallback: string): string {
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
    return fallback;
  }

  function readTrack(body: unknown): AmbientTrackRow | null {
    if (!body || typeof body !== "object" || !("track" in body)) return null;
    const track = body.track;
    if (!track || typeof track !== "object") return null;
    const row = track as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string") return null;
    if (typeof row.url !== "string") return null;
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sortOrder: typeof row.sortOrder === "number" ? row.sortOrder : 0,
      isDefault: row.isDefault === true,
      createdAt: typeof row.createdAt === "number" ? row.createdAt : 0
    };
  }
</script>

<AdminShell current="ambient" onleave={leave} {pending}>
  <main class="main">
    <header class="head">
      <div>
        <h1>Nhạc nền</h1>
        <p>Quản lý nhạc thư giãn trên R2 — trang chủ đọc danh sách này.</p>
      </div>
      <span class="count-pill">{tracks.length} bài</span>
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

    <div class="workspace">
      <section class="upload-panel" aria-label="Thêm bài nhạc">
        <div class="panel-head">
          <h2>Thêm bài</h2>
          <p>MP3 / OGG / M4A / WebM · tối đa 8 MB</p>
        </div>

        <div
          class="dropzone"
          class:active={dragOver}
          class:filled={!!file}
          class:disabled={busy}
          role="button"
          tabindex={busy ? -1 : 0}
          aria-label="Chọn hoặc kéo thả file nhạc"
          ondragenter={(e) => {
            e.preventDefault();
            dragOver = true;
          }}
          ondragover={(e) => {
            e.preventDefault();
            dragOver = true;
          }}
          ondragleave={() => (dragOver = false)}
          ondrop={onDrop}
          onclick={() => {
            if (!busy) fileInput?.click();
          }}
          onkeydown={(e) => {
            if (busy) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInput?.click();
            }
          }}
        >
          <span class="drop-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18V6l11-2v12"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="7" cy="18" r="2.2" fill="currentColor" />
              <circle cx="18" cy="16" r="2.2" fill="currentColor" />
            </svg>
          </span>
          <span class="drop-title">{file ? "Đã chọn file" : "Tải file nhạc lên"}</span>
          <span class="drop-sub">{fileLabel}</span>
        </div>
        {#if file}
          <button
            type="button"
            class="drop-clear"
            disabled={busy}
            onclick={clearFile}
          >
            Xóa lựa chọn / chọn lại
          </button>
        {/if}

        <input
          bind:this={fileInput}
          class="sr-file"
          type="file"
          accept="audio/mpeg,audio/mp3,audio/ogg,audio/mp4,audio/x-m4a,audio/webm,.mp3,.ogg,.m4a,.webm"
          disabled={busy}
          onchange={onFileChange}
        />

        <label class="field">
          <span>Tên hiển thị</span>
          <input
            type="text"
            maxlength="80"
            placeholder="Ví dụ: Piano êm"
            bind:value={title}
            disabled={busy}
          />
        </label>

        <label class="switch">
          <input type="checkbox" bind:checked={makeDefault} disabled={busy} />
          <span class="switch-ui" aria-hidden="true"></span>
          <span class="switch-text">
            <strong>Đặt làm mặc định</strong>
            <small>Phát khi người dùng mở trang lần đầu</small>
          </span>
        </label>

        <button type="button" class="primary" disabled={busy} onclick={upload}>
          {busy ? "Đang tải lên…" : "Tải lên kho nhạc"}
        </button>
      </section>

      <section class="list-panel" aria-label="Danh sách bài">
        <div class="panel-head row">
          <h2>Danh sách</h2>
          <span class="muted">{tracks.length} bài</span>
        </div>

        {#if tracks.length === 0}
          <div class="empty">
            <p>Chưa có bài nào</p>
            <span>Upload ở cột trái để bắt đầu.</span>
          </div>
        {:else}
          <ul class="list">
            {#each tracks as track (track.id)}
              <li class="row-item" class:default={track.isDefault}>
                {#if renameId === track.id}
                  <div class="rename">
                    <input
                      type="text"
                      maxlength="80"
                      bind:value={renameDraft}
                      disabled={busy}
                    />
                    <button type="button" disabled={busy} onclick={saveRename}>Lưu</button>
                    <button
                      type="button"
                      disabled={busy}
                      onclick={() => (renameId = null)}>Hủy</button
                    >
                  </div>
                {:else}
                  <div class="meta">
                    <div class="title-row">
                      <strong>{track.title}</strong>
                      {#if track.isDefault}
                        <span class="tag">Mặc định</span>
                      {/if}
                    </div>
                    <audio controls preload="none" src={track.url}></audio>
                  </div>
                  <div class="actions">
                    {#if !track.isDefault}
                      <button
                        type="button"
                        disabled={busy}
                        onclick={() => setDefault(track.id)}
                      >
                        Mặc định
                      </button>
                    {/if}
                    <button
                      type="button"
                      disabled={busy}
                      onclick={() => startRename(track)}
                    >
                      Đổi tên
                    </button>
                    <button
                      type="button"
                      class="danger"
                      disabled={busy}
                      onclick={() => remove(track.id, track.title)}
                    >
                      Xóa
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </main>
</AdminShell>

<style>
  .main {
    display: grid;
    gap: var(--space-4);
    align-content: start;
    padding: var(--space-6);
    background:
      radial-gradient(
        900px 420px at 12% -10%,
        color-mix(in srgb, var(--color-primary) 10%, transparent),
        transparent 60%
      ),
      var(--color-bg, transparent);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .head h1 {
    margin: 0 0 6px;
    font-size: 1.45rem;
    letter-spacing: -0.02em;
  }

  .head p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
  }

  .count-pill {
    flex: 0 0 auto;
    padding: 6px 12px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text-secondary);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .notice {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: 0.9rem;
  }

  .notice.ok {
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    color: var(--color-primary);
  }

  .notice.err {
    background: color-mix(in srgb, var(--color-error) 12%, transparent);
    color: var(--color-error);
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(380px, 1.15fr) minmax(280px, 0.85fr);
    gap: var(--space-5);
    align-items: start;
  }

  .upload-panel,
  .list-panel {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5);
    border: 1px solid var(--color-border);
    border-radius: calc(var(--radius-lg, 14px) + 2px);
    background: var(--color-surface);
    box-shadow: 0 10px 28px color-mix(in srgb, var(--color-text) 6%, transparent);
  }

  .upload-panel {
    position: sticky;
    top: var(--space-4);
  }

  .panel-head h2 {
    margin: 0 0 4px;
    font-size: 1.05rem;
  }

  .panel-head p,
  .panel-head .muted {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.78rem;
  }

  .panel-head.row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .dropzone {
    display: grid;
    justify-items: center;
    gap: 8px;
    width: 100%;
    padding: 28px 18px;
    border: 1.5px dashed color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
    border-radius: var(--radius-lg, 14px);
    background:
      linear-gradient(
        160deg,
        color-mix(in srgb, var(--color-primary) 8%, transparent),
        transparent 55%
      );
    color: var(--color-text);
    text-align: center;
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .dropzone:hover:not(:disabled),
  .dropzone.active {
    border-color: var(--color-primary);
    background: color-mix(in srgb, var(--color-primary) 12%, transparent);
    transform: translateY(-1px);
  }

  .dropzone.filled {
    border-style: solid;
    border-color: var(--color-primary);
  }

  .dropzone.disabled {
    opacity: 0.65;
    cursor: wait;
    pointer-events: none;
  }

  .drop-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    color: var(--color-primary);
  }

  .drop-icon svg {
    width: 22px;
    height: 22px;
  }

  .drop-title {
    font-size: 0.95rem;
    font-weight: 700;
  }

  .drop-sub {
    max-width: 24ch;
    color: var(--color-text-secondary);
    font-size: 0.78rem;
    line-height: 1.35;
  }

  .drop-clear {
    justify-self: center;
    margin-top: -8px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-primary);
    font-size: 0.78rem;
    font-weight: 650;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .sr-file {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .field {
    display: grid;
    gap: 6px;
    font-size: 0.82rem;
    color: var(--color-text-secondary);
  }

  .field input[type="text"] {
    padding: 11px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-bg, #000) 35%, transparent);
    color: var(--color-text);
    font-size: 0.95rem;
  }

  .field input:focus,
  .field input:focus-visible {
    outline: none;
    outline-offset: 0;
    border: 1px solid
      color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    box-shadow: none;
  }

  .switch {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 12px;
    align-items: center;
    cursor: pointer;
  }

  .switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .switch-ui {
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: var(--color-border);
    position: relative;
    transition: background 0.15s ease;
  }

  .switch-ui::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-surface);
    box-shadow: 0 1px 3px color-mix(in srgb, var(--color-text) 25%, transparent);
    transition: transform 0.15s ease;
  }

  .switch input:checked + .switch-ui {
    background: var(--color-primary);
  }

  .switch input:checked + .switch-ui::after {
    transform: translateX(16px);
  }

  .switch-text {
    display: grid;
    gap: 2px;
  }

  .switch-text strong {
    color: var(--color-text);
    font-size: 0.88rem;
  }

  .switch-text small {
    color: var(--color-text-muted);
    font-size: 0.72rem;
  }

  .primary {
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-radius: var(--radius-md);
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  .primary:disabled {
    opacity: 0.6;
  }

  .empty {
    display: grid;
    place-items: center;
    gap: 6px;
    min-height: 180px;
    padding: var(--space-5);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg, 14px);
    color: var(--color-text-muted);
    text-align: center;
  }

  .empty p {
    margin: 0;
    color: var(--color-text-secondary);
    font-weight: 650;
  }

  .empty span {
    font-size: 0.82rem;
  }

  .list {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row-item {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 14px);
    background: color-mix(in srgb, var(--color-bg, #000) 22%, transparent);
  }

  .row-item.default {
    border-color: color-mix(in srgb, var(--color-primary) 55%, var(--color-border));
    box-shadow: inset 3px 0 0 var(--color-primary);
  }

  .title-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .meta {
    display: grid;
    gap: 10px;
  }

  .meta strong {
    color: var(--color-text);
    font-size: 0.98rem;
  }

  .tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--color-primary) 16%, transparent);
    color: var(--color-primary);
    font-size: 0.7rem;
    font-weight: 700;
  }

  .meta audio {
    width: 100%;
    max-width: 420px;
    height: 36px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .actions button,
  .rename button {
    padding: 7px 12px;
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: transparent;
    color: var(--color-text);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .actions .danger {
    color: var(--color-error);
    border-color: color-mix(in srgb, var(--color-error) 40%, var(--color-border));
  }

  .rename {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .rename input {
    flex: 1 1 180px;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-text);
  }

  @media (max-width: 1023px) {
    .main {
      gap: var(--space-4);
      padding: var(--space-4);
    }

    .head {
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .workspace {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .upload-panel {
      position: static;
    }

    .upload-panel,
    .list-panel {
      padding: var(--space-4);
    }
  }

  @media (max-width: 767px) {
    .main {
      padding: var(--space-3);
    }

    .head h1 {
      font-size: 1.25rem;
    }

    .head p {
      font-size: 0.82rem;
    }

    .upload-panel,
    .list-panel {
      padding: var(--space-3);
      border-radius: var(--radius-lg);
    }

    .row-item {
      padding: var(--space-3);
    }

    .meta audio {
      max-width: 100%;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .actions button {
      min-height: 2.5rem;
      width: 100%;
    }

    .actions .danger {
      grid-column: 1 / -1;
    }

    .rename {
      display: grid;
      grid-template-columns: 1fr;
    }

    .rename input {
      flex: none;
      width: 100%;
    }

    .rename button {
      min-height: 2.5rem;
      width: 100%;
    }
  }
</style>
