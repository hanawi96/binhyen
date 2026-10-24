<script lang="ts">
  import ThemeToggle from "../theme/ThemeToggle.svelte";

  let username = $state("");
  let password = $state("");
  let sending = $state(false);
  let error = $state("");

  async function enter(event: SubmitEvent) {
    event.preventDefault();
    if (sending) return;

    sending = true;
    error = "";

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password
        })
      });

      password = "";

      if (!response.ok) {
        error = "Tên hoặc mật khẩu không đúng.";
        return;
      }

      window.location.assign("/admin/contents");
    } catch {
      password = "";
      error = "Không có kết nối.";
    } finally {
      sending = false;
    }
  }
</script>

<div class="theme-corner">
  <ThemeToggle />
</div>

<form class="gate" onsubmit={enter}>
  <p class="brand-mark" aria-hidden="true">✳</p>
  <h1>Đăng nhập quản trị</h1>
  <p class="lede">Dùng tài khoản quản trị của máy này.</p>
  <label>
    Tên đăng nhập
    <input
      type="text"
      name="username"
      autocomplete="username"
      bind:value={username}
      required
    />
  </label>
  <label>
    Mật khẩu
    <input
      type="password"
      name="password"
      autocomplete="current-password"
      bind:value={password}
      required
    />
  </label>
  {#if error}
    <p class="notice" role="alert">{error}</p>
  {/if}
  <button class="primary" type="submit" disabled={sending}>
    {sending ? "Đang đăng nhập…" : "Đăng nhập"}
  </button>
</form>

<style>
  .theme-corner {
    position: fixed;
    top: max(12px, env(safe-area-inset-top));
    right: max(12px, env(safe-area-inset-right));
    z-index: 2;
  }

  .gate {
    display: grid;
    gap: var(--space-4);
    width: min(420px, calc(100% - 2rem));
    margin: 12vh auto;
    padding: var(--space-8);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-text);
  }

  @media (max-width: 767px) {
    .gate {
      width: calc(100% - 1.5rem);
      margin: 4.5rem auto 1.5rem;
      margin-bottom: max(1.5rem, env(safe-area-inset-bottom));
      padding: var(--space-5);
      gap: var(--space-3);
    }

    h1 {
      font-size: 1.25rem;
    }

    .primary {
      min-height: 2.75rem;
      width: 100%;
    }
  }

  .brand-mark {
    margin: 0;
    color: var(--color-primary);
  }

  h1 {
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 560;
    letter-spacing: -0.02em;
  }

  .lede,
  label {
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
  }

  .lede {
    margin: 0;
  }

  input {
    width: 100%;
    margin-top: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text);
  }

  .primary {
    min-height: 44px;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
  }

  .primary:hover {
    background: var(--color-primary-hover);
  }

  .primary:disabled {
    cursor: progress;
    opacity: 0.65;
  }

  .notice {
    margin: 0;
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--color-error) 12%, var(--color-surface));
    color: var(--color-error);
  }
</style>
