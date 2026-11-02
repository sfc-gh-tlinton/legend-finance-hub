"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { NAV_ITEMS } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function MainNav() {
  const path = usePathname()
  return (
    <nav className="mx-auto flex w-full max-w-7xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6 lg:px-8">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
              active ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
