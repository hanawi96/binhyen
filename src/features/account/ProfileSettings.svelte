<script lang="ts">
  import {
    loadProfile,
    saveProfile,
    type AccountUser,
    type TopicChoice
  } from "./account-client";

  let {
    user,
    active = true,
    showEmail = true,
    editing = $bindable(false),
    onSaved
  }: {
    user: AccountUser;
    /** Chi tai profile khi tab/ngan dang mo. */
    active?: boolean;
    showEmail?: boolean;
    editing?: boolean;
    onSaved: (user: AccountUser, topicsChanged: boolean) => void;
  } = $props();

  const uid = $props.id();
  const topicsId = `ps-topics-${uid}`;

  let status = $state<"idle" | "loading" | "ready" | "error">("idle");
  let editStatus = $state<"loading" | "ready" | "error">("loading");
  let topics = $state<TopicChoice[]>([]);
  let editName = $state("");
  let chosen = $state<string[]>([]);
  let loadedChosen = "";
  let busy = $state(false);
  let error = $state("");
  let saved = $state(false);
  let loadedFor = "";

  let initial = $derived(
    (user.displayName.trim().charAt(0) || "·").toLocaleUpperCase("vi")
  );
  function topicKey(slugs: string[]): string {
    return [...slugs].sort().join(".");
  }

  async function ensureProfile() {
    if (!active) return;
    if (status === "loading") return;
    if (status === "ready" && loadedFor === user.id) return;

    status = "loading";
    const profile = await loadProfile();
    if (!active) return;

    if (!profile) {
      status = "error";
      return;
    }

    topics = profile.topics;
    loadedFor = user.id;
    status = "ready";
  }

  function enterEditFrom(list: TopicChoice[], name: string) {
    editName = name;
    topics = list;
    chosen = list.filter((topic) => topic.chosen).map((topic) => topic.slug);
    loadedChosen = topicKey(chosen);
    loadedFor = user.id;
    status = "ready";
    editStatus = "ready";
  }

  async function startEdit() {
    editing = true;
    editName = user.displayName;
    error = "";
    saved = false;

    // Tab xem da load profile — dung lai, khong skeleton.
    if (status === "ready") {
      enterEditFrom(topics, user.displayName);
      return;
    }

    editStatus = "loading";
    const profile = await loadProfile();
    if (!editing) return;

    if (!profile) {
      editStatus = "error";
      return;
    }

    enterEditFrom(profile.topics, profile.displayName);
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

    topics = result.profile.topics;
    loadedFor = result.user.id;
    status = "ready";
    editing = false;
    saved = true;
    onSaved(result.user, topicKey(chosen) !== loadedChosen);
  }

  function cancelEdit() {
    editing = false;
    error = "";
  }

  $effect(() => {
    if (!active) {
      editing = false;
      saved = false;
      return;
    }
    void ensureProfile();
  });

  $effect(() => {
    // Doi user (dang xuat / doi tai khoan): bo ban cu.
    user.id;
    if (loadedFor && loadedFor !== user.id) {
      status = "idle";
      topics = [];
      loadedFor = "";
      editing = false;
    }
  });
</script>

{#if editing}
  <form class="ps-form" onsubmit={saveEdit} novalidate>
    <label class="ps-field">
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

    <div class="ps-field">
      <span id={topicsId}>Chủ đề bạn thích</span>
      {#if editStatus === "loading"}
        <div class="ps-chips" aria-hidden="true">
          {#each [0, 1, 2, 3, 4] as index (index)}
            <span class="ps-chip ps-chip-ghost"></span>
          {/each}
        </div>
      {:else if editStatus === "error"}
        <p class="ps-soft">
          Chưa tải được danh sách chủ đề.
          <button type="button" class="ps-inline" onclick={startEdit}>
            Thử lại
          </button>
        </p>
      {:else}
        <div class="ps-chips" role="group" aria-labelledby={topicsId}>
          {#each topics as topic (topic.slug)}
            <button
              type="button"
              class="ps-chip"
              class:on={chosen.includes(topic.slug)}
              aria-pressed={chosen.includes(topic.slug)}
              onclick={() => toggleTopic(topic.slug)}
            >
              {topic.label}
            </button>
          {/each}
        </div>
        <p class="ps-soft">Chọn vài chủ đề để Bình Yên hiểu bạn hơn.</p>
      {/if}
    </div>

    <p class="ps-error" aria-live="polite">{error}</p>

    <button
      type="submit"
      class="ps-submit"
      disabled={busy || editStatus !== "ready"}
    >
      {busy ? "Đang lưu…" : "Lưu thay đổi"}
    </button>
    <button type="button" class="ps-text" onclick={cancelEdit}>Huỷ</button>
  </form>
{:else}
  <div class="ps-profile">
    <span class="ps-avatar" aria-hidden="true">{initial}</span>
    <div class="ps-who">
      <p class="ps-name">{user.displayName}</p>
      {#if showEmail}
        <p class="ps-email">{user.email}</p>
      {/if}
    </div>
    <button
      type="button"
      class="ps-pen"
      aria-label="Chỉnh sửa hồ sơ"
      title="Chỉnh sửa"
      onclick={startEdit}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M11.7 2.3a1.2 1.2 0 0 1 1.7 1.7L5.8 11.6 3 12.5l.9-2.8 7.8-7.4Z"
        />
        <path d="M3 13.5h10" />
      </svg>
    </button>
  </div>

  {#if saved}
    <p class="ps-saved" aria-live="polite">Đã lưu thay đổi.</p>
  {/if}

  <div class="ps-block">
    <p class="ps-label">Chủ đề bạn thích</p>
    {#if status === "loading" || status === "idle"}
      <div class="ps-chips" aria-hidden="true">
        {#each [0, 1, 2] as index (index)}
          <span class="ps-chip ps-chip-ghost"></span>
        {/each}
      </div>
    {:else if status === "error"}
      <p class="ps-soft">
        Chưa tải được chủ đề.
        <button type="button" class="ps-inline" onclick={() => { status = "idle"; void ensureProfile(); }}>
          Thử lại
        </button>
      </p>
    {:else}
      <div class="ps-chips" aria-label="Chủ đề">
        {#each topics as topic (topic.slug)}
          <span
            class="ps-chip"
            class:on={topic.chosen}
            class:off={!topic.chosen}
          >
            {topic.label}
          </span>
        {/each}
      </div>
      {#if !topics.some((topic) => topic.chosen)}
        <p class="ps-soft">Chưa chọn chủ đề nào. Bấm bút để chọn.</p>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .ps-profile {
    display: flex;
    gap: 14px;
    align-items: center;
    margin: 4px 0 16px;
  }

  .ps-avatar {
    display: grid;
    flex: none;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 1px solid color-mix(in oklab, var(--color-text) 16%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 48%, transparent);
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 26px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .ps-who {
    min-width: 0;
  }

  .ps-who p {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ps-name {
    color: var(--color-text);
    font-family: var(--font-editorial);
    font-size: 24px;
    letter-spacing: -0.02em;
  }

  .ps-email {
    margin-top: 2px;
    color: var(--color-text-muted);
    font-size: 13px;
  }

  .ps-pen {
    display: grid;
    flex: none;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-left: auto;
    padding: 0;
    border: 1px solid color-mix(in oklab, var(--color-text) 18%, transparent);
    border-radius: 50%;
    background: color-mix(in oklab, var(--color-surface) 42%, transparent);
    color: var(--color-text);
    cursor: pointer;
  }

  .ps-pen svg {
    width: 15px;
    height: 15px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ps-saved {
    margin: -6px 0 12px;
    color: var(--color-text-muted);
    font-size: 12px;
  }

  .ps-block {
    margin: 0 0 18px;
  }

  .ps-label {
    margin: 0 0 8px;
    color: var(--color-eyebrow);
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  .ps-form {
    display: grid;
    gap: 14px;
    margin-top: 6px;
  }

  .ps-field {
    display: grid;
    gap: 4px;
  }

  .ps-field > span:first-child {
    color: var(--color-eyebrow);
    font-size: 12px;
    letter-spacing: 0.02em;
  }

  .ps-field input {
    width: 100%;
    padding: 10px 0;
    border: 0;
    border-bottom: 1px solid
      color-mix(in oklab, var(--color-text) 16%, transparent);
    border-radius: 0;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .ps-field input:focus {
    border-bottom-color: color-mix(
      in oklab,
      var(--color-primary) 70%,
      transparent
    );
  }

  .ps-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
  }

  .ps-chip {
    min-height: 34px;
    padding: 6px 14px;
    border: 1px solid color-mix(in oklab, var(--color-text) 14%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--color-surface) 24%, transparent);
    color: var(--color-chip);
    font: inherit;
    font-size: 14px;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      color 160ms ease;
  }

  span.ps-chip {
    cursor: default;
  }

  .ps-chip.on {
    border-color: var(--color-chip-active-line);
    background: var(--color-chip-active-bg);
    color: var(--color-chip-active);
  }

  .ps-chip.off {
    opacity: 0.42;
    border-color: color-mix(in oklab, var(--color-text) 10%, transparent);
    background: transparent;
    color: var(--color-text-muted);
  }

  .ps-chip-ghost {
    width: 84px;
    border-color: transparent;
    background: var(--color-surface-soft);
  }

  .ps-soft {
    margin: 8px 0 0;
    color: var(--color-text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .ps-inline {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-text-secondary);
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .ps-error {
    min-height: 18px;
    margin: 0;
    color: var(--color-error);
    font-size: 13px;
    line-height: 1.4;
  }

  .ps-submit {
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
  }

  .ps-submit:disabled {
    opacity: 0.7;
    cursor: default;
  }

  .ps-text {
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
</style>
