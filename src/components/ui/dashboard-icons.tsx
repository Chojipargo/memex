import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" {...line} />
      <path d="m15.4 15.4 4.1 4.1" {...line} />
    </svg>
  );
}

export function TrailsIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <circle cx="5.5" cy="17.5" r="2.2" {...line} />
      <circle cx="12" cy="7" r="2.2" {...line} />
      <circle cx="18.5" cy="15" r="2.2" {...line} />
      <path d="M6.8 15.6c1-3 2.2-5.2 4-6.7M13.6 8.2c1.5 1.3 2.8 3.3 3.7 5.4" {...line} />
    </svg>
  );
}

export function HelpIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <circle cx="12" cy="12" r="8.5" {...line} />
      <path d="M9.8 9.2a2.3 2.3 0 1 1 3.3 2.1c-.8.4-1.1 1-1.1 1.9" {...line} />
      <path d="M12 16.8h.01" {...line} strokeWidth={2.2} />
    </svg>
  );
}

export function SparkIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path
        d="M12 3.5c.6 4.8 3.7 7.9 8.5 8.5-4.8.6-7.9 3.7-8.5 8.5-.6-4.8-3.7-7.9-8.5-8.5 4.8-.6 7.9-3.7 8.5-8.5Z"
        {...line}
      />
    </svg>
  );
}

export function ArrowUpRightIcon({
  className = "size-[18px]",
  ...props
}: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M7 17 17 7M8 7h9v9" {...line} />
    </svg>
  );
}

export function ArrowRightIcon({
  className = "size-[18px]",
  ...props
}: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" {...line} />
    </svg>
  );
}

export function ArrowLeftIcon({
  className = "size-[18px]",
  ...props
}: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M19.5 12h-15M10.5 6l-6 6 6 6" {...line} />
    </svg>
  );
}

export function PlusIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M12 5v14M5 12h14" {...line} />
    </svg>
  );
}

export function PinIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="m9 4 6 6-2.2 1.3-.7 4.2-3.1-3.1-4.2.7L6.1 11 3.5 8.4 9 4Z" {...line} />
      <path d="m8.2 13.8-4.7 4.7" {...line} />
    </svg>
  );
}

export function CloseIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="m6 6 12 12M18 6 6 18" {...line} />
    </svg>
  );
}

export function LinkIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" {...line} />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" {...line} />
    </svg>
  );
}

export function BookIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z" {...line} />
      <path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20" {...line} />
      <path d="M8 7h8" {...line} />
    </svg>
  );
}

export function SendIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="m20.5 3.5-7.2 17-2.2-7.1-7.1-2.2 16.5-7.7Z" {...line} />
      <path d="m11.1 13.4 4.6-4.6" {...line} />
    </svg>
  );
}

export function ChevronRightIcon({
  className = "size-[18px]",
  ...props
}: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="m9 5 7 7-7 7" {...line} />
    </svg>
  );
}

export function LogOutIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10" {...line} />
      <path d="M13.5 8.5 17 12l-3.5 3.5M9.5 12H21" {...line} />
    </svg>
  );
}

export function NoteIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15Z" {...line} />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" {...line} />
    </svg>
  );
}

export function BranchIcon({ className = "size-[18px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <circle cx="6" cy="5" r="2" {...line} />
      <circle cx="18" cy="12" r="2" {...line} />
      <circle cx="6" cy="19" r="2" {...line} />
      <path d="M6 7v10M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3h-1" {...line} />
    </svg>
  );
}

export function CommandIcon({ className = "size-[16px]", ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>
      <path d="M9 6a3 3 0 1 0-3 3h3V6Zm0 0v12a3 3 0 1 1-3-3h3V6Zm6 0a3 3 0 1 1 3 3h-3V6Zm0 0v12a3 3 0 1 0 3-3h-3V6ZM9 9h6v6H9V9Z" {...line} />
    </svg>
  );
}
