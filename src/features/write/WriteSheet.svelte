<script lang="ts">
  import { untrack } from "svelte";
  import Sheet from "../sheet/Sheet.svelte";
  import {
    loadDraft,
    submitPost,
    updatePost,
    type MinePost
  } from "../mine/mine-client";

  const MAX_TOPICS = 3;
  const TITLE_MAX = 280;

  let {
    open,
    userId,
    userKnown,
    topics,
    edit,
    onClose,
    onSignIn,
    onSaved,
    onOpenPosts
  }: {
    open: boolean;
    userId: string | null;
    userKnown: boolean;
    topics: Array<{ key: string; label: string }>;
    /** Bai nhap dang sua; serial tang moi lan mo de tai lai ban moi nhat. */
    edit: { id: string; serial: number } | null;
    onClose: () => void;
    onSignIn: () => void;
    onSaved: () => void;
    onOpenPosts: () => void;
  } = $props();

  const uid = $props.id();
  const titleId = `write-title-${uid}`;
  const topicsId = `write-topics-${uid}`;

  let title = $state("");
  let description = $state("");
  let body = $state("");
  let chosen = $state<string[]>([]);
  let busy = $state(false);
  let error = $state("");
  let sent = $state<MinePost | null>(null);
  let editState = $state<"loading" | "ready" | "error">("ready");
  let editError = $state("");
  let edited = $state("");
  let owner: string | null = null;
  let editKey = "";

  let full = $derived(chosen.length >= MAX_TOPICS);

  function reset() {
    title = "";
    description = "";
    body = "";
    chosen = [];
    error = "";
    sent = null;
    edited = "";
    editState = "ready";
    editError = "";
  }

  // Doi tai khoan thi bo ban dang viet cua nguoi truoc.
  $effect(() => {
    if (userId === owner) return;
    owner = userId;
    reset();
  });

  async function startEdit(id: string, key: string) {
    editState = "loading";
    const result = await loadDraft(id);
    if (key !== editKey) return;

    if (!result.ok) {
      editState = "error";
      editError = result.message;
      return;
    }

    const known = new Set(topics.map((topic) => topic.key));
    title = result.draft.title;
    description = result.draft.description;
    body = result.draft.body;
    chosen = result.draft.topics.filter((key) => known.has(key));
    editState = "ready";
  }

  // Mo de sua: tai ban nhap. Chuyen tu sua sang viet moi: bo trong form.
  $effect(() => {
    if (!open) return;

    const key = edit ? `${edit.id}:${edit.serial}` : "";
    if (key === editKey) return;
    editKey = key;

    untrack(() => {
      reset();
      if (edit) void startEdit(edit.id, key);
    });
  });

  function toggleTopic(key: string) {
    error = "";
    if (chosen.includes(key)) {
      chosen = chosen.filter((item) => item !== key);
    } else if (!full) {
      chosen = [...chosen, key];
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    if (!title.trim()) {
      error = "Hãy viết câu chữ chính.";
      return;
    }
    if (chosen.length === 0) {
      error = "Hãy chọn ít nhất 1 chủ đề.";
      return;
    }

    busy = true;
    error = "";

    const fields = { title, description, body, topics: chosen };

    if (edit) {
      const result = await updatePost(edit.id, fields);
      busy = false;

      if (!result.ok) {
        error = result.message;
        return;
      }

      const savedTitle = title.trim();
      reset();
      edited = savedTitle;
      onSaved();
      return;
    }

    const result = await submitPost(fields);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    reset();
    sent = result.post;
    onSaved();
  }
</script>

<Sheet {open} tall title={edit ? "Sửa bài" : "Viết nội dung"} {onClose}>
  <div class="write-body">
    {#if !userKnown || (edit && editState === "loading")}
      <div class="write-ghost" aria-hidden="true">
        <span></span>
        <span></span>
      </div>
    {:else if !userId}
      <div class="write-note">
        <p>Cần có tài khoản để viết và giữ bài của bạn.</p>
        <button type="button" class="write-submit" onclick={onSignIn}>
          Đăng nhập hoặc tạo tài khoản
        </button>
      </div>
    {:else if edit && editState === "error"}
      <div class="write-note" aria-live="polite">
        <p>{editError}</p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Về «Đã viết»
        </button>
      </div>
    {:else if edited}
      <div class="write-note" aria-live="polite">
        <p class="write-done">Đã lưu thay đổi «{edited}».</p>
        <p class="write-soft">Bài vẫn đang chờ duyệt.</p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Xem trong «Đã viết»
        </button>
      </div>
    {:else if sent}
      <div class="write-note" aria-live="polite">
        <p class="write-done">Đã gửi «{sent.title}».</p>
        <p class="write-soft">
          Bài đang ở dạng bản nháp và sẽ hiện trên Bình Yên sau khi được duyệt.
        </p>
        <button type="button" class="write-submit" onclick={onOpenPosts}>
          Xem trong «Đã viết»
        </button>
        <button type="button" class="write-text" onclick={() => (sent = null)}>
          Viết bài khác
        </button>
      </div>
    {:else}
      <form class="write-form" onsubmit={submit} novalidate>
        <div class="write-field">
          <label for={titleId}>Câu chữ chính</label>
          <textarea
            id={titleId}
            class="write-title"
            rows="2"
            maxlength={TITLE_MAX}
            placeholder="Điều bạn muốn kể…"
            bind:value={title}
          ></textarea>
          {#if title.length > TITLE_MAX - 40}
            <span class="write-count">{title.length}/{TITLE_MAX}</span>
          {/if}
        </div>

        <label class="write-field">
          <span>Mô tả ngắn</span>
          <input
            type="text"
            maxlength="400"
            placeholder="Không bắt buộc"
            bind:value={description}
          />
        </label>

        <label class="write-field">
          <span>Nội dung</span>
          <textarea
            rows="7"
            maxlength="8000"
            placeholder="Không bắt buộc. Viết dài hơn nếu bạn muốn."
            bind:value={body}
          ></textarea>
        </label>

        <div class="write-field">
          <span id={topicsId}>Chủ đề (1–{MAX_TOPICS})</span>
          <div class="write-chips" role="group" aria-labelledby={topicsId}>
            {#each topics as topic (topic.key)}
              {@const on = chosen.includes(topic.key)}
              <button
                type="button"
                class="write-chip"
                class:on
                aria-pressed={on}
                disabled={!on && full}
                onclick={() => toggleTopic(topic.key)}
              >
                {topic.label}
              </button>
            {/each}
          </div>
        </div>

        <p class="write-error" aria-live="polite">{error}</p>

        <button type="submit" class="write-submit" disabled={busy}>
          {#if edit}
            {busy ? "Đang lưu…" : "Lưu thay đổi"}
          {:else}
            {busy ? "Đang gửi…" : "Gửi bài"}
          {/if}
        </button>
        <p class="write-soft write-center">
          {edit
            ? "Chỉ sửa được khi bài còn chờ duyệt."
            : "Bài được lưu thành bản nháp và hiện lên sau khi được duyệt."}
        </p>
      </form>
    {/if}
  </div>
</Sheet>

<style>
  .write-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 22px max(22px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  .write-form {
    display: grid;
    gap: 16px;
    padding-top: 8px;
  }

  .write-field {
    position: relative;
    display: grid;
    gap: 4px;
  }

  .write-field > span:first-child,
  .write-field > label {
    color: var(--color-eyebrow);
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  .write-field input,
  .write-field textarea {
    width: 100%;
    padding: 8px 0;
    border: 0;
    border-bottom: 1px solid var(--color-sheet-line);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    line-height: 1.55;
    outline: none;
    resize: vertical;
  }

  .write-field .write-title {
    font-family: var(--font-editorial);
    font-size: 20px;
    line-height: 1.35;
    resize: none;
  }

  .write-field input:focus,
  .write-field textarea:focus {
    border-bottom-color: var(--color-primary);
  }

  .write-field input::placeholder,
  .write-field textarea::placeholder {
    color: var(--color-text-muted);
  }

  .write-count {
    justify-self: end;
    color: var(--color-text-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .write-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .write-chip {
    min-height: 34px;
    padding: 6px 14px;
    border: 1px solid var(--color-sheet-line);
    border-radius: 999px;
    background: transparent;
    color: var(--color-chip);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      color 160ms ease,
      opacity 160ms ease;
  }

  .write-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .write-chip:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .write-error {
    min-height: 18px;
    margin: 0;
    color: var(--color-error);
    font-size: 13px;
    line-height: 1.4;
  }

  .write-submit {
    width: 100%;
    min-height: 46px;
    border: 0;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--color-sheet);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 160ms ease;
  }

  .write-submit:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .write-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .write-text {
    display: block;
    margin: 6px auto 0;
    padding: 10px 14px;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .write-note {
    padding: 40px 8px;
    color: var(--color-sheet-body);
    font-size: 15px;
    line-height: 1.6;
    text-align: center;
  }

  .write-note p {
    margin: 0 0 14px;
  }

  .write-done {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 20px;
    line-height: 1.4;
  }

  .write-soft {
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .write-note .write-soft {
    margin-bottom: 22px;
  }

  .write-center {
    margin: -4px 0 0;
    text-align: center;
  }

  .write-ghost {
    display: grid;
    gap: 10px;
    padding: 18px 0 40px;
  }

  .write-ghost span {
    height: 14px;
    border-radius: 7px;
    background: var(--color-surface-soft);
  }

  .write-ghost span + span {
    width: 60%;
  }

  @media (max-width: 640px) {
    .write-body {
      padding: 6px 16px max(18px, env(safe-area-inset-bottom));
    }
  }
</style>
