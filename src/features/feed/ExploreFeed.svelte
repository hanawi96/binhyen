<script lang="ts">
  import type { AccountUser } from "../account/account-client";
  import type { ContentItem } from "../content/content.types";
  import SwipeDeck from "./SwipeDeck.svelte";

  let {
    initialItems = [],
    initialCursor = null,
    initialPageCursor = null,
    initialMatched = true,
    initialNotice = null,
    initialUser,
    initialPostNews = 0
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialPageCursor?: string | null;
    initialMatched?: boolean;
    initialNotice?: "all-seen" | null;
    initialUser?: AccountUser | null;
    initialPostNews?: number;
  } = $props();
</script>

<div class="explore-page">
  <SwipeDeck
    {initialItems}
    {initialCursor}
    {initialPageCursor}
    {initialMatched}
    {initialNotice}
    {initialUser}
    {initialPostNews}
  />
</div>

<style>
  .explore-page {
    position: relative;
    height: 100dvh;
    overflow: hidden;
    background:
      radial-gradient(circle at top left, var(--scene-glow-sage) 0%, transparent 34%),
      radial-gradient(circle at bottom right, var(--scene-glow-warm) 0%, transparent 34%),
      linear-gradient(180deg, var(--scene-top) 0%, var(--color-background) 100%);
  }
</style>
