<script lang="ts">
  import ThemeToggle from "../theme/ThemeToggle.svelte";

  let username = $state("");
  let password = $state("");
  let showPassword = $state(false);
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

      try {
        const payload = (await response.json().catch(() => null)) as {
          admin?: { displayName?: string; username?: string };
        } | null;
        const label =
          payload?.admin?.displayName?.trim() ||
          payload?.admin?.username?.trim() ||
          username.trim();
        sessionStorage.setItem("binhyen-admin-name", label);
      } catch {
        try {
          sessionStorage.setItem("binhyen-admin-name", username.trim());
        } catch {
          // Bo qua.
        }
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

<main class="login-scene">
  <div class="wash" aria-hidden="true">
    <span class="orb orb-a"></span>
    <span class="orb orb-b"></span>
    <span class="grain"></span>
  </div>

  <div class="theme-corner">
    <ThemeToggle />
  </div>

  <form class="gate" onsubmit={enter}>
    <header class="gate-head">
      <p class="brand">Bình Yên</p>
      <span class="rule" aria-hidden="true"></span>
      <h1>Đăng nhập quản trị</h1>
      <p class="lede">Một khoảng lặng trước khi vào phòng làm việc.</p>
    </header>

    <div class="fields">
      <label>
        <span>Tên đăng nhập</span>
        <input
          type="text"
          name="username"
          autocomplete="username"
          bind:value={username}
          required
          minlength="3"
          maxlength="40"
          pattern={"[A-Za-z0-9._-]{3,40}"}
          title="3–40 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
        />
      </label>
      <label>
        <span>Mật khẩu</span>
        <div class="password-field">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autocomplete="current-password"
            bind:value={password}
            required
          />
          <button
            type="button"
            class="reveal"
            aria-pressed={showPassword}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onclick={() => (showPassword = !showPassword)}
          >
            {showPassword ? "Ẩn" : "Hiện"}
          </button>
        </div>
      </label>
    </div>

    {#if error}
      <p class="notice" role="alert">{error}</p>
    {/if}

    <button class="primary" type="submit" disabled={sending}>
      {sending ? "Đang đăng nhập…" : "Đăng nhập"}
    </button>
  </form>
</main>

<style>
  .login-scene {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    min-height: 100dvh;
    min-height: 100svh;
    padding:
      max(1.25rem, env(safe-area-inset-top))
      max(1.25rem, env(safe-area-inset-right))
      max(1.25rem, env(safe-area-inset-bottom))
      max(1.25rem, env(safe-area-inset-left));
    overflow: hidden;
    background: var(--color-background);
    color: var(--color-text);
  }

  .wash {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    background:
      radial-gradient(
        90% 70% at 12% 8%,
        color-mix(in oklab, var(--color-theme-peace) 88%, transparent),
        transparent 62%
      ),
      radial-gradient(
        80% 65% at 92% 90%,
        color-mix(in oklab, var(--scene-glow-warm, #f1e4d4) 55%, transparent),
        transparent 58%
      ),
      linear-gradient(
        168deg,
        color-mix(in oklab, var(--color-theme-peace) 55%, var(--color-background))
          0%,
        var(--color-background) 52%,
        color-mix(in oklab, var(--color-surface-soft) 40%, var(--color-background))
          100%
      );
  }

  .orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(28px);
    opacity: 0.55;
    animation: drift 16s var(--ease-standard) infinite alternate;
  }

  .orb-a {
    width: min(42vw, 22rem);
    height: min(42vw, 22rem);
    top: -8%;
    left: -6%;
    background: color-mix(in oklab, var(--color-primary) 28%, transparent);
  }

  .orb-b {
    width: min(48vw, 26rem);
    height: min(48vw, 26rem);
    right: -10%;
    bottom: -12%;
    background: color-mix(in oklab, var(--color-brand-mark) 34%, transparent);
    animation-delay: -6s;
    animation-duration: 20s;
  }

  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 180px 180px;
    mix-blend-mode: multiply;
  }

  :global(html[data-theme="dark"]) .grain {
    opacity: 0.06;
    mix-blend-mode: soft-light;
  }

  .theme-corner {
    position: absolute;
    top: max(0.75rem, env(safe-area-inset-top));
    right: max(0.75rem, env(safe-area-inset-right));
    z-index: 2;
  }

  .gate {
    position: relative;
    z-index: 1;
    display: grid;
    gap: var(--space-6);
    width: min(26rem, 100%);
    padding: clamp(1.35rem, 3.5vw, 2.15rem);
    border: 1px solid color-mix(in oklab, var(--color-border) 80%, transparent);
    border-radius: var(--radius-xl);
    background: color-mix(in oklab, var(--color-surface) 82%, transparent);
    backdrop-filter: blur(14px);
    animation: rise 0.7s var(--ease-standard) both;
  }

  .gate-head {
    display: grid;
    gap: var(--space-3);
    text-align: center;
  }

  .brand {
    margin: 0;
    color: var(--color-primary);
    font-family: var(--font-editorial);
    font-size: clamp(2rem, 6vw, 2.55rem);
    font-weight: 500;
    letter-spacing: -0.03em;
    line-height: 1.05;
  }

  .rule {
    display: block;
    width: 2.5rem;
    height: 1px;
    margin-inline: auto;
    background: color-mix(in oklab, var(--color-primary) 45%, transparent);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.05rem, 2.8vw, 1.2rem);
    font-weight: 560;
    letter-spacing: -0.015em;
  }

  .lede {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .fields {
    display: grid;
    gap: var(--space-4);
  }

  label {
    display: grid;
    gap: var(--space-2);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  input {
    width: 100%;
    min-height: 2.85rem;
    padding: 0.7rem 0.9rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--color-background) 70%, var(--color-surface));
    color: var(--color-text);
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .password-field {
    position: relative;
  }

  .password-field input {
    padding-inline-end: 4rem;
  }

  .reveal {
    position: absolute;
    top: 50%;
    right: 0.45rem;
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

  .reveal:hover {
    color: var(--color-primary);
  }

  input:focus {
    outline: none;
    border-color: color-mix(in oklab, var(--color-primary) 55%, var(--color-border));
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 18%, transparent);
  }

  .primary {
    min-height: 2.85rem;
    width: 100%;
    border: 0;
    border-radius: var(--radius-full);
    background: var(--color-primary);
    color: var(--color-surface);
    font-size: var(--text-sm);
    font-weight: 650;
    letter-spacing: 0.01em;
    transition:
      background var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .primary:active:not(:disabled) {
    transform: translateY(1px);
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
    font-size: var(--text-sm);
    text-align: center;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0.7rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes drift {
    from {
      transform: translate3d(0, 0, 0) scale(1);
    }
    to {
      transform: translate3d(3%, 4%, 0) scale(1.06);
    }
  }

  @media (max-width: 479px) {
    .login-scene {
      align-items: stretch;
      padding:
        max(3.5rem, calc(env(safe-area-inset-top) + 2.75rem))
        max(1rem, env(safe-area-inset-right))
        max(1rem, env(safe-area-inset-bottom))
        max(1rem, env(safe-area-inset-left));
    }

    .gate {
      width: 100%;
      margin-block: auto;
      gap: var(--space-5);
      padding: 1.35rem 1.15rem 1.25rem;
      border-radius: var(--radius-lg);
    }

    .brand {
      font-size: 2rem;
    }
  }

  @media (max-height: 640px) and (orientation: landscape) {
    .login-scene {
      align-items: start;
      padding-block: 1rem;
    }

    .gate {
      gap: var(--space-4);
      margin-block: 0.5rem;
      padding: 1.1rem 1.25rem;
    }

    .orb {
      opacity: 0.35;
      filter: blur(20px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gate,
    .orb {
      animation: none;
    }
  }
</style>
