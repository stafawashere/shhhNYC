"use client";

import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

type Position = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  children: React.ReactNode;
  content: React.ReactNode;
  position?: Position;
  offset?: number;
  className?: string;
}

export default function Tooltip({
  children,
  content,
  position = "top",
  offset = 8,
  className = ""
}: TooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [safeRect, setSafeRect] = useState<DOMRect | null>(null);
  
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updatePosition = () => {
    if (!triggerRef.current || !contentRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    
    // Temporarily show content to measure it if it's not already visible
    // In React 19, we can rely on the fact that it's rendered in the portal
    const contentEl = contentRef.current.getBoundingClientRect();
    
    if (contentEl.width === 0) {
      // If not yet measured, we can't position it accurately. 
      // This might happen on the first frame of isOpen.
      // We'll trigger a re-render.
      requestAnimationFrame(updatePosition);
      return;
    }

    let top = 0;
    let left = 0;

    switch (position) {
      case "top":
        top = trigger.top - contentEl.height - offset;
        left = trigger.left + (trigger.width - contentEl.width) / 2;
        break;
      case "bottom":
        top = trigger.bottom + offset;
        left = trigger.left + (trigger.width - contentEl.width) / 2;
        break;
      case "left":
        top = trigger.top + (trigger.height - contentEl.height) / 2;
        left = trigger.left - contentEl.width - offset;
        break;
      case "right":
        top = trigger.top + (trigger.height - contentEl.height) / 2;
        left = trigger.right + offset;
        break;
    }

    // Keep within viewport
    const padding = 12;
    left = Math.max(padding, Math.min(left, window.innerWidth - contentEl.width - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - contentEl.height - padding));

    setCoords({ top, left }); // Keep viewport-relative

    // Calculate Safe Zone (Bounding Box) in viewport coordinates
    const combinedTop = Math.min(trigger.top, top);
    const combinedLeft = Math.min(trigger.left, left);
    const combinedRight = Math.max(trigger.right, left + contentEl.width);
    const combinedBottom = Math.max(trigger.bottom, top + contentEl.height);

    setSafeRect(new DOMRect(
      combinedLeft,
      combinedTop,
      combinedRight - combinedLeft,
      combinedBottom - combinedTop
    ));
  };

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener("scroll", updatePosition);
      window.addEventListener("resize", updatePosition);
    }
    return () => {
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150); // Slightly longer grace period
  };

  return (
    <>
      <div 
        ref={triggerRef}
        className={`inline-block ${className}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {children}
      </div>

      {isOpen && createPortal(
        <div 
          className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
        >
          {/* Invisible Safe Zone Bounding Box - acts as a mouse bridge */}
          {safeRect && (
            <div 
              className="absolute pointer-events-auto"
              style={{
                top: safeRect.top - 15,
                left: safeRect.left - 15,
                width: safeRect.width + 30,
                height: safeRect.height + 30,
                background: "transparent",
                // border: "1px solid red", // Debug: uncomment to see the box
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />
          )}

          {/* Actual Tooltip Content */}
          <div
            ref={contentRef}
            className="absolute pointer-events-auto"
            style={{
              top: coords.top,
              left: coords.left,
              opacity: coords.top === 0 ? 0 : 1, // Hide until positioned
              transition: "opacity 0.2s ease-out, transform 0.2s ease-out",
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
