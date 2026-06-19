import { useCallback, useEffect, useRef } from "react";

type DragState = {
  isDragging: boolean;
  startX: number;
  startScrollLeft: number;
};

/**
 * Horizontal drag-to-scroll (and shift-free trackpad/wheel scroll) for wide tables.
 */
export const useDragToScroll = <T extends HTMLElement>(enabled = true) => {
  const ref = useRef<T>(null);
  const dragState = useRef<DragState>({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const onMouseDown = useCallback((event: React.MouseEvent) => {
    if (event.button !== 0 || !ref.current) return;

    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, [role='button']")) return;

    dragState.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: ref.current.scrollLeft,
    };
    ref.current.style.cursor = "grabbing";
    ref.current.style.userSelect = "none";
  }, []);

  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!dragState.current.isDragging || !ref.current) return;

    event.preventDefault();
    const deltaX = event.clientX - dragState.current.startX;
    ref.current.scrollLeft = dragState.current.startScrollLeft - deltaX;
  }, []);

  const stopDragging = useCallback(() => {
    if (!ref.current) return;
    dragState.current.isDragging = false;
    ref.current.style.cursor = "grab";
    ref.current.style.userSelect = "";
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [enabled]);

  return {
    ref,
    onMouseDown,
    onMouseMove,
    onMouseUp: stopDragging,
    onMouseLeave: stopDragging,
  };
};
