'use client';

import { useEffect } from 'react';

/**
 * Observes `.mkt-reveal` elements and adds `is-visible` when they enter the viewport.
 */
export default function MarketingMotion({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.mkt-reveal'));
    if (!nodes.length) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      nodes.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );

    nodes.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return <>{children}</>;
}
