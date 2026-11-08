"use client";

import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function DialogAccessibility() {
  useEffect(() => {
    let activeDialog = null;
    let returnFocusTo = null;

    const syncDialog = () => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]'));
      const nextDialog = dialogs[dialogs.length - 1] || null;
      if (nextDialog === activeDialog) return;

      if (activeDialog && !nextDialog) {
        const previousFocusTarget = returnFocusTo;
        activeDialog = null;
        returnFocusTo = null;
        if (previousFocusTarget?.isConnected) previousFocusTarget.focus();
        return;
      }

      activeDialog = nextDialog;
      if (!activeDialog) return;

      returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusable = Array.from(activeDialog.querySelectorAll(FOCUSABLE))
        .find((element) => element.getClientRects().length > 0);
      if (focusable) {
        focusable.focus();
      } else {
        if (!activeDialog.hasAttribute("tabindex")) activeDialog.setAttribute("tabindex", "-1");
        activeDialog.focus();
      }
    };

    const handleKeyDown = (event) => {
      if (!activeDialog?.isConnected) return;

      if (event.key === "Escape") {
        const closeButton = Array.from(activeDialog.querySelectorAll("button"))
          .find((button) => /cerrar|close|cancelar/i.test(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`));
        if (closeButton) {
          event.preventDefault();
          closeButton.click();
        }
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(activeDialog.querySelectorAll(FOCUSABLE))
        .filter((element) => element.getClientRects().length > 0);

      if (focusable.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !activeDialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", handleKeyDown);
    syncDialog();

    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return null;
}
