'use client';

import { useEffect } from "react";

const phrases = [
  "🎵 Entertainment",
  "🎤 Music Videos",
  "👤 Artists",
  "📺 Shows",
  "🗓️ Events",
  "⚽ Sports",
];

export function RemoveLegacyBar() {
  useEffect(() => {
    try {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            return phrases.some((p) => node.textContent?.includes(p))
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          },
        },
      );

      const targets: HTMLElement[] = [];
      let current: Node | null = walker.nextNode();
      while (current) {
        if (current.parentElement) {
          targets.push(current.parentElement);
        }
        current = walker.nextNode();
      }

      targets.forEach((el) => {
        el.remove();
      });
    } catch (err) {
      console.error("cleanup legacy bar failed", err);
    }
  }, []);

  return null;
}
