"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Generic overlay primitive -- portal + backdrop + Escape-to-close +
// click-outside-to-close -- shared by the dashboard's "Talk to AI Analyst"
// modal and the floating contextual AI agent on detail pages, so the app
// has exactly one dialog implementation rather than one per caller. Callers
// own everything inside the panel (header, close button, content); this
// component only owns the overlay mechanics.
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
  panelClassName = "w-full max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  panelClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);

    // Prevent the page behind the modal from scrolling while it's open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only close on a direct click on the backdrop itself, not on
        // anything inside the panel that happens to bubble up to it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={panelClassName}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
