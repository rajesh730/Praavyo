'use client';

import { useLayoutEffect, useRef, useState } from 'react';

const A4_WIDTH = 794; // 210mm at 96dpi

/**
 * Shows report-card sheets exactly as they look on a computer — true A4
 * width — and shrinks the whole page to fit a narrow (phone) screen, the
 * same way certificates are shown. Without it, phones reflow the sheet into a
 * different, narrower layout.
 *
 * Printing and Download PDF are unaffected: print resets the scaling
 * (apps/pravyo/app/cas.css) and the PDF capture draws each sheet on its own.
 */
export default function A4Viewport({ children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [fit, setFit] = useState({ scale: 1, height: null });

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return undefined;
    const update = () => {
      const scale = Math.min(1, outer.clientWidth / A4_WIDTH);
      const height = scale < 1 ? Math.ceil(inner.scrollHeight * scale) : null;
      setFit((current) => (Math.abs(current.scale - scale) < 0.001 && current.height === height ? current : { scale, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const scaled = fit.scale < 1;
  return (
    <div
      ref={outerRef}
      className={`cas-a4-scale${scaled ? ' is-scaled' : ''}`}
      style={scaled ? { position: 'relative', overflow: 'hidden', height: fit.height ?? undefined } : undefined}
    >
      <div
        ref={innerRef}
        className="cas-a4-scale-inner"
        style={scaled ? { position: 'absolute', left: 0, top: 0, width: A4_WIDTH, transform: `scale(${fit.scale})`, transformOrigin: 'top left' } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
