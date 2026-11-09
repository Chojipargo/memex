import { NotepadPenSketch } from "./notepad-pen-sketch";

/**
 * Decorative auth backdrop: a muted gradient and faint grid with the notepad
 * line-art drifting slowly over it. Purely presentational, so it sits behind
 * the readability scrims in `AuthShell`.
 */
export function AuthArtwork() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(85%_65%_at_55%_42%,#1b1b1b_0%,#101010_45%,#070707_100%)]" />

      {/* Faint blueprint grid */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:80px_80px] [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]" />

      {/* Halo behind the artwork */}
      <div className="absolute left-1/2 top-1/2 size-[min(78vmin,760px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.04] blur-[120px]" />

      {/* Artwork wrapper aligns to the content column, then nudges outward */}
      <div className="relative mx-auto h-full w-full max-w-7xl px-6 sm:px-8 lg:px-10">
        <div className="absolute left-1/2 top-[30%] w-[min(620px,148vw)] -translate-x-1/2 -translate-y-1/2 sm:top-[34%] sm:w-[min(780px,112vw)] lg:left-auto lg:right-0 lg:top-[58%] lg:w-[min(1040px,72vw)] lg:translate-x-[4%]">
          <div className="art-float text-white/[0.24]">
            <NotepadPenSketch className="h-auto w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
