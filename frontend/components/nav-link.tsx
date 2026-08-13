"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

export function NavLink({
  href,
  className,
  activeClassName,
  ...props
}: ComponentProps<typeof Link> & { activeClassName: string }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(String(href));

  return <Link href={href} className={isActive ? activeClassName : className} {...props} />;
}
