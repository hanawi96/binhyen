import { countSeen, mergeSeen } from "./seen-bits";
import {
  mergePositions,
  serializePositions,
  type Positions
} from "./viewer-positions";

/** Phan trang thai can gop khi dang nhap (khong gom key / version). */
export interface MergeableViewerState {
  seen: Uint8Array;
  seenCount: number;
  positions: Positions;
  freshAt: number;
  loopCount: number;
}

export interface MergedViewerState {
  seen: Uint8Array;
  seenCount: number;
  positionsJson: string;
  freshAt: number;
  loopCount: number;
}

/**
 * Gop lich su an danh vao tai khoan.
 * into = null: chi doi khoa (doi ten dong an danh).
 * Bitmap OR; moc bai moi / so vong lay lon hon; vi tri an danh thang khi trung.
 */
export function mergeViewerStates(
  into: MergeableViewerState | null,
  from: MergeableViewerState
): MergedViewerState {
  if (!into) {
    return {
      seen: from.seen,
      seenCount: from.seenCount,
      positionsJson: serializePositions(from.positions),
      freshAt: from.freshAt,
      loopCount: from.loopCount
    };
  }

  const seen = mergeSeen(into.seen, from.seen);

  return {
    seen,
    seenCount: countSeen(seen),
    positionsJson: serializePositions(
      mergePositions(into.positions, from.positions)
    ),
    freshAt: Math.max(into.freshAt, from.freshAt),
    loopCount: Math.max(into.loopCount, from.loopCount)
  };
}
