/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, useEffect, CSSProperties, UIEvent, ReactNode } from "react";

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
  className?: string;
  onScrollBottom?: () => void;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  renderItem,
  className = "",
  onScrollBottom,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); // sensible default

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // Measure height on mount and on resize
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height || 600);
      }
    });

    resizeObserver.observe(element);
    
    // Set initial height
    setContainerHeight(element.clientHeight || 600);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const totalHeight = items.length * itemHeight;

  // Buffer defines how many extra items to render above and below the viewport
  const BUFFER = 5;

  // Visible indices calculation
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - BUFFER);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + BUFFER
  );

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);

    // If near the bottom, trigger callback if provided (useful for infinite scrolling or logs)
    if (onScrollBottom && target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      onScrollBottom();
    }
  };

  // Reset scroll position if items array changes significantly (e.g. searching/filtering)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [items.length]);

  const visibleItems: ReactNode[] = [];
  for (let i = startIndex; i <= endIndex; i++) {
    const item = items[i];
    if (item) {
      const style: CSSProperties = {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: `${itemHeight}px`,
        transform: `translateY(${i * itemHeight}px)`,
      };
      visibleItems.push(renderItem(item, i, style));
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`relative overflow-y-auto outline-none ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
      id="virtualized-list-container"
    >
      <div style={{ height: `${totalHeight}px`, width: "100%", position: "relative" }}>
        {visibleItems}
      </div>
      {items.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 font-sans p-6 text-center">
          <svg
            className="w-12 h-12 mb-3 text-slate-300 animate-pulse"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-base font-medium">No Villages Found</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            Try adjusting your search criteria or make sure you have typed the township name correctly.
          </p>
        </div>
      )}
    </div>
  );
}
