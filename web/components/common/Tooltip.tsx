"use client";

import React, { useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";

type Position = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: Position;
  offset?: number;
  className?: string;
  /** For left/right: vertical alignment with trigger (start = top edges align). For top/bottom: horizontal alignment. Default center. */
  crossAlign?: "start" | "center" | "end";
}

interface TooltipCoords {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function Tooltip({
  children,
  content,
  position = "top",
  offset = 8,
  className = "",
  crossAlign = "center",
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipCoords | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fadeOutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = useCallback(() => {
    function measure() {
      if (!triggerRef.current || !contentRef.current) return;

      const trigger = triggerRef.current.getBoundingClientRect();
      const contentEl = contentRef.current.getBoundingClientRect();

      if (contentEl.width === 0) {
        requestAnimationFrame(measure);
        return;
      }

      let top = 0;
      let left = 0;

      switch (position) {
        case "top":
          top = trigger.top - contentEl.height - offset;
          if (crossAlign === "start") left = trigger.left;
          else if (crossAlign === "end") left = trigger.right - contentEl.width;
          else left = trigger.left + (trigger.width - contentEl.width) / 2;
          break;
        case "bottom":
          top = trigger.bottom + offset;
          if (crossAlign === "start") left = trigger.left;
          else if (crossAlign === "end") left = trigger.right - contentEl.width;
          else left = trigger.left + (trigger.width - contentEl.width) / 2;
          break;
        case "left":
          left = trigger.left - contentEl.width - offset;
          if (crossAlign === "start") top = trigger.top;
          else if (crossAlign === "end") top = trigger.bottom - contentEl.height;
          else top = trigger.top + (trigger.height - contentEl.height) / 2;
          break;
        case "right":
          left = trigger.right + offset;
          if (crossAlign === "start") top = trigger.top;
          else if (crossAlign === "end") top = trigger.bottom - contentEl.height;
          else top = trigger.top + (trigger.height - contentEl.height) / 2;
          break;
      }

      const padding = 12;
      left = Math.max(padding, Math.min(left, window.innerWidth - contentEl.width - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - contentEl.height - padding));

      setCoords({ top, left, width: contentEl.width, height: contentEl.height });
    }

    measure();
  }, [position, offset, crossAlign]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition, { passive: true });
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, updatePosition]);

  const handleMouseEnter = (e: React.MouseEvent) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (fadeOutRef.current) clearTimeout(fadeOutRef.current);
    setMousePos({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
    // Defer to next frame so the portal mounts before we trigger the fade-in
    requestAnimationFrame(() => setIsVisible(true));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      // Unmount after the CSS transition completes (200ms)
      fadeOutRef.current = setTimeout(() => setIsOpen(false), 200);
    }, 150);
  };

  // Build the safe triangle SVG polygon points.
  // The triangle connects the current cursor to the two near corners of the tooltip,
  // giving the user a clean diagonal path without flickering.
  const safeTrianglePoints = coords
    ? getSafeTrianglePoints(mousePos, coords, position)
    : null;

  return (
    <>
      <div
        ref={triggerRef}
        className={`inline-flex items-center justify-center ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {isOpen &&
        createPortal(
          <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
            {/* Safe triangle SVG — bridges cursor to tooltip without a bounding box */}
            {safeTrianglePoints && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: "visible" }}
              >
                <polygon
                  points={safeTrianglePoints}
                  fill="transparent"
                  stroke="transparent"
                  // stroke="red" strokeWidth="1" // Debug: uncomment to visualise
                  style={{ pointerEvents: "all", cursor: "default" }}
                  onMouseEnter={handleMouseEnter}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                />
              </svg>
            )}

            {/* Actual tooltip content */}
            <div
              ref={contentRef}
              className="absolute pointer-events-auto"
              style={{
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                opacity: isVisible && coords ? 1 : 0,
                transition: "opacity 0.2s ease-out",
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Returns SVG polygon points for a safe triangle.
 *
 * The triangle is formed by three vertices:
 *   A — current cursor position
 *   B, C — the two corners of the tooltip face nearest to the trigger
 *
 * This exactly covers the diagonal gap between cursor and tooltip with no
 * wasted area, unlike a rectangular bounding box.
 */
function getSafeTrianglePoints(
  cursor: { x: number; y: number },
  tooltip: TooltipCoords,
  position: Position
): string {
  const { top, left, width, height } = tooltip;
  const right = left + width;
  const bottom = top + height;

  // Pick the two corners on the tooltip face that faces the trigger element
  let b: [number, number];
  let c: [number, number];

  switch (position) {
    case "top":
      // Tooltip is above — near face is the bottom edge
      b = [left, bottom];
      c = [right, bottom];
      break;
    case "bottom":
      // Tooltip is below — near face is the top edge
      b = [left, top];
      c = [right, top];
      break;
    case "left":
      // Tooltip is to the left — near face is the right edge
      b = [right, top];
      c = [right, bottom];
      break;
    case "right":
      // Tooltip is to the right — near face is the left edge
      b = [left, top];
      c = [left, bottom];
      break;
  }

  return `${cursor.x},${cursor.y} ${b[0]},${b[1]} ${c[0]},${c[1]}`;
}
