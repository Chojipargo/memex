export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="relative grid size-9 place-items-center rounded-xl border border-white/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 5.2 9 2l6 3.2-6 3.2-6-3.2Z"
            stroke="white"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="m3 9 6 3.2L15 9"
            stroke="white"
            strokeOpacity=".55"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path
            d="m3 12.6 6 3.2 6-3.2"
            stroke="white"
            strokeOpacity=".28"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.03em] text-white">
        memex<span className="text-neutral-400">.ai</span>
      </span>
    </div>
  );
}
