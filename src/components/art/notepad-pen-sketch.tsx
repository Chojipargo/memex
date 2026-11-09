import type { SVGProps } from "react";

/**
 * Original decorative line-art: a spiral-bound sketchbook with a pen resting
 * across it. Drawn as a single square, monochrome composition so it can be
 * tinted with `currentColor` and layered behind the auth layout.
 */
export function NotepadPenSketch({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  const coils = [182, 223, 264, 305, 346, 387, 428, 469, 510];

  return (
    <svg
      viewBox="0 0 720 720"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {/* Soft grounding shadow beneath the pad */}
      <ellipse
        cx="352"
        cy="594"
        rx="186"
        ry="18"
        fill="currentColor"
        stroke="none"
        opacity="0.06"
      />

      <g transform="rotate(-7 360 368)">
        {/* Back cover peeking out from behind the page block */}
        <rect
          x="218"
          y="158"
          width="308"
          height="416"
          rx="20"
          opacity="0.4"
        />

        {/* Front page */}
        <rect x="198" y="138" width="308" height="416" rx="20" />

        {/* Fore-edge page lines */}
        <path d="M252 550h216" opacity="0.45" />
        <path d="M268 560h184" opacity="0.3" />

        {/* Spiral binding: rings loop out past the left edge */}
        {coils.map((y) => (
          <g key={y}>
            <ellipse
              cx="192"
              cy={y}
              rx="15"
              ry="8.5"
              transform={`rotate(-20 192 ${y})`}
            />
            <circle cx="214" cy={y} r="3.2" opacity="0.55" strokeWidth={2} />
          </g>
        ))}

        {/* Page header */}
        <path d="M262 198h166" strokeWidth={3.4} />
        <path d="M262 214h84" opacity="0.45" strokeWidth={2.2} />
        <path d="M262 240h214" opacity="0.22" strokeWidth={2} />

        {/* Checklist */}
        <rect x="266" y="268" width="27" height="27" rx="7" />
        <path d="m273 281 6 7 12 -15" strokeWidth={2.2} />
        <path d="M312 282h142" opacity="0.65" strokeWidth={2.2} />

        <rect x="266" y="318" width="27" height="27" rx="7" opacity="0.55" />
        <path d="M312 332h108" opacity="0.5" strokeWidth={2.2} />

        <rect x="266" y="368" width="27" height="27" rx="7" opacity="0.55" />
        <path d="M312 382h152" opacity="0.5" strokeWidth={2.2} />

        {/* Small sketched landscape in the remaining page space */}
        <circle cx="442" cy="424" r="17" opacity="0.75" />
        <path
          d="M442 398v-9M442 459v9M416 424h-9M468 424h9M424 406l-7-7M460 442l7 7M460 406l7-7M424 442l-7 7"
          opacity="0.45"
          strokeWidth={2}
        />
        <path
          d="M292 486c18-24 32-30 48-16 10-14 22-18 36-6 12-10 24-9 40 6 12-8 24-6 40 8"
          opacity="0.7"
        />
        <path d="M286 490h190" opacity="0.55" strokeWidth={2.2} />

        {/* Page number and a couple of stray marks */}
        <path d="M262 522h34" opacity="0.35" strokeWidth={2} />
        <path
          d="M448 522l6-6M454 516l-6-6M466 520l6-6"
          opacity="0.28"
          strokeWidth={2}
        />
      </g>

      {/* Pen resting diagonally across the lower half of the pad */}
      <g transform="translate(410 520) rotate(-24)">
        {/* Nib */}
        <path d="M-150 0-116-12v24Z" />
        <path d="M-138 0h20" opacity="0.7" strokeWidth={2.2} />
        <circle
          cx="-144"
          cy="0"
          r="2.2"
          fill="currentColor"
          stroke="none"
          opacity="0.7"
        />

        {/* Barrel */}
        <rect x="-116" y="-13" width="190" height="26" rx="13" />
        <path d="M-74-13v26M-62-13v26" opacity="0.45" strokeWidth={2} />

        {/* Cap and band */}
        <rect x="64" y="-13" width="96" height="26" rx="13" />
        <path d="M64-13v26" opacity="0.55" strokeWidth={2.2} />

        {/* Clip */}
        <rect
          x="84"
          y="-9"
          width="58"
          height="8"
          rx="4"
          opacity="0.7"
          strokeWidth={2}
        />
        <circle
          cx="78"
          cy="-5"
          r="2.4"
          fill="currentColor"
          stroke="none"
          opacity="0.7"
        />
      </g>

      {/* Loose accent marks for balance */}
      <g opacity="0.3" strokeWidth={2.2}>
        <path d="M604 196v24M592 208h24" />
        <path d="M132 596l18-9M150 587l-4 14" />
      </g>
      <circle
        cx="620"
        cy="228"
        r="3"
        fill="currentColor"
        stroke="none"
        opacity="0.35"
      />
    </svg>
  );
}
