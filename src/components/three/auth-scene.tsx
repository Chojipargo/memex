"use client";

import dynamic from "next/dynamic";

const Scene = dynamic(() => import("./scene").then((mod) => mod.Scene), {
  ssr: false,
  loading: () => null,
});

export function AuthScene() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Static fallback: visible before the canvas chunk hydrates */}
      <div className="absolute inset-0 bg-[radial-gradient(85%_65%_at_55%_42%,#1b1b1b_0%,#101010_45%,#070707_100%)]" />
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:80px_80px] [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]" />
      <Scene />
    </div>
  );
}
