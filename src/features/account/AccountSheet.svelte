<script lang="ts">
  import Sheet from "../sheet/Sheet.svelte";
  import {
    loadProfile,
    saveProfile,
    signOut,
    submitAuth,
    type AccountUser,
    type TopicChoice
  } from "./account-client";

  type Mode = "login" | "register";

  let {
    open,
    user,
    userKnown,
    onClose,
    onSignedIn,
    onSignedOut,
    onOpenMine,
    onProfileSaved
  }: {
    open: boolean;
    user: AccountUser | null;
    userKnown: boolean;
    onClose: () => void;
    onSignedIn: (user: AccountUser) => void;
    onSignedOut: () => void;
    onOpenMine: () => void;
    onProfileSaved: (user: AccountUser, topicsChanged: boolean) => void;
  } = $props();

  const modes: Array<{ key: Mode; label: string }> = [
    { key: "login", label: "Đăng nhập" },
    { key: "register", label: "Tạo tài khoản" }
  ];

  const uid = $props.id();
  const passwordId = `acc-password-${uid}`;
  const topicsId = `acc-topics-${uid}`;

  let editing = $state(false);
  let editStatus = $state<"loading" | "ready" | "error">("loading");
  let editName = $state("");
  let topicChoices = $state<TopicChoice[]>([]);
  let chosen = $state<string[]>([]);
  let loadedChosen = "";
  let saved = $state(false);

  function topicKey(slugs: string[]): string {
    return [...slugs].sort().join(".");
  }

  let mode = $state<Mode>("login");
  let displayName = $state("");
  let email = $state("");
  let password = $state("");
  let reveal = $state(false);
  let busy = $state(false);
  let error = $state("");

  let initial = $derived(
    (user?.displayName.trim().charAt(0) || "·").toLocaleUpperCase("vi")
  );

  function chooseMode(key: Mode) {
    mode = key;
    error = "";
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    busy = true;
    error = "";

    const fields: Record<string, string> = { email, password };
    if (mode === "register" && displayName.trim()) {
      fields.displayName = displayName.trim();
    }

    const result = await submitAuth(mode, fields);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    password = "";
    reveal = false;
    onSignedIn(result.user);
  }

  async function startEdit() {
    if (!user) return;

    editing = true;
    editStatus = "loading";
    editName = user.displayName;
    error = "";
    saved = false;

    const profile = await loadProfile();
    if (!editing) return;

    if (!profile) {
      editStatus = "error";
      return;
    }

    editName = profile.displayName;
    topicChoices = profile.topics;
    chosen = profile.topics
      .filter((topic) => topic.chosen)
      .map((topic) => topic.slug);
    loadedChosen = topicKey(chosen);
    editStatus = "ready";
  }

  function toggleTopic(slug: string) {
    chosen = chosen.includes(slug)
      ? chosen.filter((item) => item !== slug)
      : [...chosen, slug];
  }

  async function saveEdit(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;

    busy = true;
    error = "";

    const result = await saveProfile(editName, chosen);
    busy = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    editing = false;
    saved = true;
    onProfileSaved(result.user, topicKey(chosen) !== loadedChosen);
  }

  function cancelEdit() {
    editing = false;
    error = "";
  }

  // Dong ngan hoac doi nguoi dung thi bo phan dang sua.
  $effect(() => {
    if (!open || !user) editing = false;
    if (!open) saved = false;
  });

  async function leave() {
    if (busy) return;

    busy = true;
    const ok = await signOut();
    busy = false;

    if (ok) {
      error = "";
      mode = "login";
      onSignedOut();
    } else {
      error = "Chưa đăng xuất được. Hãy thử lại.";
    }
  }
</script>

<Sheet {open} title="Tài khoản" {onClose}>
  <div class="acc-body">
    {#if !userKnown}
      <div class="acc-ghost" aria-hidden="true">
        <span></span>
        <span></span>
      </div>
    {:else if user && editing}
      <form class="acc-form acc-edit" onsubmit={saveEdit} novalidate>
        <label class="acc-field">
          <span>Tên hiển thị</span>
          <input
            type="text"
            name="name"
            autocomplete="nickname"
            maxlength="60"
            required
            bind:value={editName}
          />
        </label>

        <div class="acc-field">
          <span id={topicsId}>Chủ đề bạn thích</span>
          {#if editStatus === "loading"}
            <div class="acc-chips" aria-hidden="true">
              {#each [0, 1, 2, 3, 4] as index (index)}
                <span class="acc-chip acc-chip-ghost"></span>
              {/each}
            </div>
          {:else if editStatus === "error"}
            <p class="acc-soft">
              Chưa tải được danh sách chủ đề.
              <button type="button" class="acc-inline" onclick={startEdit}>
                Thử lại
              </button>
            </p>
          {:else}
            <div class="acc-chips" role="group" aria-labelledby={topicsId}>
              {#each topicChoices as topic (topic.slug)}
                <button
                  type="button"
                  class="acc-chip"
                  class:on={chosen.includes(topic.slug)}
                  aria-pressed={chosen.includes(topic.slug)}
                  onclick={() => toggleTopic(topic.slug)}
                >
                  {topic.label}
                </button>
              {/each}
            </div>
            <p class="acc-soft">Chọn vài chủ đề để Bình Yên hiểu bạn hơn.</p>
          {/if}
        </div>

        <p class="acc-error" aria-live="polite">{error}</p>

        <button
          type="submit"
          class="acc-submit"
          disabled={busy || editStatus !== "ready"}
        >
          {busy ? "Đang lưu…" : "Lưu thay đổi"}
        </button>
        <button type="button" class="acc-text" onclick={cancelEdit}>
          Huỷ
        </button>
      </form>
    {:else if user}
      <div class="acc-profile">
        <span class="acc-avatar" aria-hidden="true">{initial}</span>
        <div class="acc-who">
          <p class="acc-name">{user.displayName}</p>
          <p class="acc-email">{user.email}</p>
        </div>
      </div>

      <ul class="acc-links">
        <li>
          <button type="button" class="acc-link" onclick={onOpenMine}>
            <span>Của tôi</span>
            <span class="acc-hint">Đã thích, đã lưu, đã viết</span>
          </button>
        </li>
        <li>
          <button type="button" class="acc-link" onclick={startEdit}>
            <span>Chỉnh sửa hồ sơ & chủ đề</span>
            <span class="acc-hint" aria-live="polite">
              {saved ? "Đã lưu" : "Tên, chủ đề"}
            </span>
          </button>
        </li>
      </ul>

      <p class="acc-error" aria-live="polite">{error}</p>

      <button
        type="button"
        class="acc-text"
        disabled={busy}
        onclick={leave}
      >
        {busy ? "Đang đăng xuất…" : "Đăng xuất"}
      </button>
    {:else}
      <div class="acc-modes" role="tablist" aria-label="Tài khoản">
        {#each modes as item (item.key)}
          <button
            type="button"
            role="tab"
            class="acc-mode"
            class:active={mode === item.key}
            aria-selected={mode === item.key}
            onclick={() => chooseMode(item.key)}
          >
            {item.label}
          </button>
        {/each}
      </div>

      <form class="acc-form" onsubmit={submit} novalidate>
        {#if mode === "register"}
          <label class="acc-field">
            <span>Tên hiển thị</span>
            <input
              type="text"
              name="name"
              autocomplete="nickname"
              maxlength="60"
              placeholder="Không bắt buộc"
              bind:value={displayName}
            />
          </label>
        {/if}

        <label class="acc-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="off"
            spellcheck="false"
            required
            bind:value={email}
          />
        </label>

        <div class="acc-field">
          <label for={passwordId}>Mật khẩu</label>
          <span class="acc-pass">
            <input
              id={passwordId}
              type={reveal ? "text" : "password"}
              name="password"
              autocomplete={mode === "login"
                ? "current-password"
                : "new-password"}
              minlength="8"
              maxlength="200"
              required
              bind:value={password}
            />
            <button
              type="button"
              class="acc-reveal"
              aria-label="Hiện mật khẩu"
              aria-pressed={reveal}
              onclick={() => (reveal = !reveal)}
            >
              {reveal ? "Ẩn" : "Hiện"}
            </button>
          </span>
        </div>

        <p class="acc-error" aria-live="polite">{error}</p>

        <button type="submit" class="acc-submit" disabled={busy}>
          {#if busy}
            Đang xử lý…
          {:else}
            {mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          {/if}
        </button>
      </form>

      <p class="acc-note">
        Lượt thích và bài đã lưu trên trình duyệt này sẽ được giữ trong tài
        khoản.
      </p>
    {/if}
  </div>
</Sheet>

<style>
  .acc-body {
    overflow-y: auto;
    padding: 6px 22px max(22px, env(safe-area-inset-bottom));
    overscroll-behavior: contain;
  }

  .acc-modes {
    display: flex;
    gap: 22px;
    margin: 6px 0 18px;
    border-bottom: 1px solid var(--color-sheet-line);
  }

  .acc-mode {
    margin-bottom: -1px;
    padding: 10px 0;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--color-text-muted);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  .acc-mode.active {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: 600;
  }

  .acc-form {
    display: grid;
    gap: 14px;
  }

  .acc-field {
    display: grid;
    gap: 4px;
  }

  .acc-field > span:first-child,
  .acc-field > label {
    color: var(--color-eyebrow);
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  .acc-field input {
    width: 100%;
    padding: 8px 0;
    border: 0;
    border-bottom: 1px solid var(--color-sheet-line);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .acc-field input:focus {
    border-bottom-color: var(--color-primary);
  }

  .acc-field input::placeholder {
    color: var(--color-text-muted);
  }

  .acc-pass {
    position: relative;
    display: block;
  }

  .acc-pass input {
    padding-right: 52px;
  }

  .acc-reveal {
    position: absolute;
    top: 50%;
    right: 0;
    padding: 6px 2px;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transform: translateY(-50%);
  }

  .acc-error {
    min-height: 18px;
    margin: 0;
    color: var(--color-error);
    font-size: 13px;
    line-height: 1.4;
  }

  .acc-submit {
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

  .acc-submit:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .acc-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .acc-note {
    margin: 16px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }

  .acc-profile {
    display: flex;
    gap: 14px;
    align-items: center;
    margin: 10px 0 18px;
  }

  .acc-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: var(--color-surface-soft);
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 22px;
  }

  .acc-who {
    min-width: 0;
  }

  .acc-who p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .acc-name {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 20px;
  }

  .acc-email {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .acc-links {
    margin: 0 0 6px;
    padding: 0;
    border-top: 1px solid var(--color-sheet-line);
    list-style: none;
  }

  .acc-links li {
    border-bottom: 1px solid var(--color-sheet-line);
  }

  .acc-link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 14px 0;
    border: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 15px;
    text-align: left;
    cursor: pointer;
  }

  .acc-link:disabled {
    color: var(--color-text-muted);
    cursor: default;
  }

  .acc-hint {
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .acc-text {
    display: block;
    margin: 4px auto 0;
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

  .acc-edit {
    margin-top: 10px;
  }

  .acc-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .acc-chip {
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
      color 160ms ease;
  }

  .acc-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .acc-chip-ghost {
    width: 84px;
    border-color: transparent;
    background: var(--color-surface-soft);
  }

  .acc-soft {
    margin: 8px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .acc-inline {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .acc-ghost {
    display: grid;
    gap: 10px;
    padding: 18px 0 40px;
  }

  .acc-ghost span {
    height: 14px;
    border-radius: 7px;
    background: var(--color-surface-soft);
  }

  .acc-ghost span + span {
    width: 60%;
  }

  @media (max-width: 640px) {
    .acc-body {
      padding: 6px 16px max(18px, env(safe-area-inset-bottom));
    }
  }
</style>
