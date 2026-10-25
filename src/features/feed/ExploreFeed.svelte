<script lang="ts">
  import type { AccountUser } from "../account/account-client";
  import type { ContentItem } from "../content/content.types";
  import DebugPanel from "../debug/DebugPanel.svelte";
  import SwipeDeck from "./SwipeDeck.svelte";

  export interface CollectionView {
    slug: string;
    title: string;
    description: string;
    coverUrl?: string;
    coverAlt?: string;
    itemCount: number;
  }

  let {
    initialItems = [],
    initialCursor = null,
    initialPageCursor = null,
    initialMatched = true,
    initialNotice = null,
    initialUser,
    initialPostNews = 0,
    initialTopics = [],
    collection = null
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialPageCursor?: string | null;
    initialMatched?: boolean;
    initialNotice?: "all-seen" | null;
    initialUser?: AccountUser | null;
    initialPostNews?: number;
    initialTopics?: Array<{ slug: string; label: string }>;
    collection?: CollectionView | null;
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
    {initialTopics}
    {collection}
  />
  <DebugPanel />
</div>

<style>
  .explore-page {
    position: relative;
    height: 100dvh;
    overflow: hidden;
    /* Wash theo theme do SwipeDeck.atmosphere đảm nhiệm. */
    background: var(--color-background);
  }
</style>
