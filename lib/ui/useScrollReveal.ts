"use client";

import { useEffect, useRef } from "react";

/**
 * Adds a `revealed` class to the returned ref's element once it scrolls
 * into view, so CSS can transition it in. No animation library — plain
 * IntersectionObserver, matching this app's zero-new-dependencies stance.
 *
 * Fires once per element (unobserves after reveal) since this is a
 * one-time entrance animation, not a repeating scroll effect.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      node.classList.add("revealed");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return ref;
}
