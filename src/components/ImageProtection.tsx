"use client";

import { useEffect } from "react";

export default function ImageProtection() {
  useEffect(() => {
    function preventContext(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        e.preventDefault();
      }
    }

    function preventDrag(e: DragEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "IMG") {
        e.preventDefault();
      }
    }

    document.addEventListener("contextmenu", preventContext);
    document.addEventListener("dragstart", preventDrag);

    return () => {
      document.removeEventListener("contextmenu", preventContext);
      document.removeEventListener("dragstart", preventDrag);
    };
  }, []);

  return null;
}
