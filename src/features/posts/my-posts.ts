import type { ContentStatus, ContentTheme } from "../content/content.types";
import type { MyReactionCursor } from "../interactions/my-reactions";

export interface MyPostItem {
  id: string;
  title: string;
  category: string;
  description: string;
  theme: ContentTheme;
  status: ContentStatus;
  createdAt: number;
  /** Vua duoc duyet / tu choi ma nguoi viet chua xem. */
  fresh: boolean;
  /** Ly do tu choi, neu quan tri co ghi. */
  note: string | null;
}

export interface MyPostPage {
  items: MyPostItem[];
  nextCursor: string | null;
}

/** Cung dang "thoi diem.id" voi danh sach thich / luu. */
export type MyPostCursor = MyReactionCursor;

export interface MyPostStore {
  page(
    userId: string,
    cursor: MyPostCursor | null,
    limit: number
  ): Promise<MyPostPage>;
  count(userId: string): Promise<number>;
  openDrafts(userId: string): Promise<number>;
  /** So bai co ket qua duyet moi, chua xem. */
  news(userId: string): Promise<number>;
  markSeen(userId: string, now: number): Promise<void>;
  /** null khi bai khong ton tai hoac khong phai cua nguoi nay. */
  statusOf(userId: string, id: string): Promise<ContentStatus | null>;
  /** Xoa ban nhap cua chinh minh; false neu bai da doi trang thai. */
  withdraw(userId: string, id: string): Promise<boolean>;
}
