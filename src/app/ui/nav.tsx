"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEFAULT_CANDIDATE_ID } from "@/lib/replay/constants";

const LINKS = [
  { href: "/", label: "Command Centre", match: (p: string) => p === "/" },
  {
    href: `/investigate/${DEFAULT_CANDIDATE_ID}`,
    label: "Investigation",
    match: (p: string) => p.startsWith("/investigate"),
  },
  {
    href: "/knowledge",
    label: "Knowledge",
    match: (p: string) => p.startsWith("/knowledge"),
  },
  {
    href: "/evaluations",
    label: "Evaluations",
    match: (p: string) => p.startsWith("/evaluations"),
  },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-4 text-[13px] font-medium">
      {LINKS.map((link) => {
        const current = link.match(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={
              current
                ? "text-ink underline decoration-ink underline-offset-4"
                : "text-mute no-underline hover:text-ink"
            }
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
