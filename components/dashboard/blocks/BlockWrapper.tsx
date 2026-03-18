import Link from "next/link";
import { ReactNode } from "react";

type Props = {
  title: string;
  size: "big" | "small";
  href: string;
  children: ReactNode;
  /** If true, hides overflow in the content area (default: true). */
  clip?: boolean;
  /** Optional override for the outer container height class (e.g. "h-[560px]"). */
  heightClassName?: string;
};

const HEIGHTS = {
  big: "h-[420px]",
  small: "h-[300px]",
};

export default function BlockWrapper({
  title,
  size,
  href,
  children,
  clip = true,
  heightClassName,
}: Props) {
  return (
    <div className={`rounded-xl border bg-white p-4 flex flex-col ${heightClassName ?? HEIGHTS[size]}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Link href={href} className="text-xs text-primary hover:underline">
          Tümünü Gör
        </Link>
      </div>

      <div className={`flex-1 ${clip ? "overflow-hidden" : "overflow-visible"}`}>{children}</div>
    </div>
  );
}
