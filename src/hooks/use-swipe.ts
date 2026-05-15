"use client";

import { useRef } from "react";

/**
 * useSwipe — a low-level touch handler used by every row in the inbox.
 *
 * Gestures:
 *   - left-swipe   → onSwipeLeft (typically Archive)
 *   - right-swipe  → onSwipeRight (typically Star / Mark unread)
 *   - long right-swipe (≥ 140px) → onLongRight (AI summary)
 *
 * The hook returns a `bind` you spread onto the swipeable element and an
 * imperative `style` setter you can apply via a parent <motion.div> or a
 * useState for a "snap-back" visual effect. We keep visuals to the caller
 * so this hook stays portable.
 */

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onLongRight?: () => void;
  /** Pixels of horizontal drag required to commit a short swipe. */
  threshold?: number;
  /** Pixels for a "long" right swipe — triggers the AI summary action. */
  longThreshold?: number;
  /** Called with the live delta-x while dragging. Use to drive transforms. */
  onDrag?: (dx: number) => void;
}

export function useSwipe(h: SwipeHandlers) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const lockedAxis = useRef<"x" | "y" | null>(null);
  const threshold = h.threshold ?? 64;
  const longThreshold = h.longThreshold ?? 140;

  function reset() {
    startX.current = null;
    startY.current = null;
    lockedAxis.current = null;
    h.onDrag?.(0);
  }

  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      startX.current = t.clientX;
      startY.current = t.clientY;
      lockedAxis.current = null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (startX.current == null || startY.current == null) return;
      const t = e.touches[0];
      const dx = t.clientX - startX.current;
      const dy = t.clientY - startY.current;
      if (lockedAxis.current == null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          lockedAxis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
      }
      if (lockedAxis.current === "x") {
        e.preventDefault?.();
        h.onDrag?.(dx);
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (startX.current == null) return;
      if (lockedAxis.current === "x") {
        const dx = (e.changedTouches[0]?.clientX ?? startX.current) - startX.current;
        if (dx <= -threshold) h.onSwipeLeft?.();
        else if (dx >= longThreshold) h.onLongRight?.();
        else if (dx >= threshold) h.onSwipeRight?.();
      }
      reset();
    },
    onTouchCancel: reset,
  };
}
