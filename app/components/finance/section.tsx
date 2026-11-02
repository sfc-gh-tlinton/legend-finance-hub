import type React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export function Section({ title, description, actions, children, className, flush = false }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode
  children: React.ReactNode; className?: string; flush?: boolean
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className={flush ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  )
}

export const PAGE = "mx-auto w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
