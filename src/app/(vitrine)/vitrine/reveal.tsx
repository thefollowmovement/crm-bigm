"use client";

import { useEffect } from "react";

// Anime les éléments .v-rv de la vitrine à l'entrée dans le viewport.
// Composant invisible : la page reste un server component.
export function VitrineReveal() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll(".v-rv"));
    if (targets.length === 0) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      for (const el of targets) el.classList.add("v-on");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("v-on");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 }
    );
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return null;
}
