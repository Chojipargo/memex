import { FlowingLines } from "./flowing-lines";

/**
 * Decorative auth backdrop: a muted gradient with a field of flowing lines
 * that gather into a single stroke near the right edge. Purely presentational,
 * so it sits behind the readability scrims in `AuthShell`.
 */
export function AuthArtwork() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(85%_65%_at_55%_42%,#1b1b1b_0%,#101010_45%,#070707_100%)]" />

      {/* Halo where the lines converge */}
      <div className="absolute left-[81%] top-[51%] size-[min(72vmin,660px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.055] blur-[110px]" />

      <FlowingLines className="absolute inset-0 h-full w-full text-white opacity-60 lg:opacity-100" />

      {/* Keep the outer frame deep so content stays dominant */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_95%_at_50%_48%,transparent_42%,rgba(7,7,7,0.55)_100%)]" />
    </div>
  );
}
