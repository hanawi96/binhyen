<script lang="ts">
  import type { AccountUser } from "../account/account-client";
  import type { ContentItem } from "../content/content.types";
  import SwipeDeck from "./SwipeDeck.svelte";

  export interface CollectionView {
    slug: string;
    title: string;
    description: string;
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
    collection = null
  }: {
    initialItems?: ContentItem[];
    initialCursor?: string | null;
    initialPageCursor?: string | null;
    initialMatched?: boolean;
    initialNotice?: "all-seen" | null;
    initialUser?: AccountUser | null;
    initialPostNews?: number;
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
    {collection}
  />
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
