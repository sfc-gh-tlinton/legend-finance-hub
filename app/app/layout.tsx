import type { Metadata } from "next"
import type React from "react"
import { AppHeader } from "@/components/app-header"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/components/query-provider"
import { AssistantProvider } from "@/components/finance/assistant-context"
import { AssistantShell } from "@/components/finance/assistant-shell"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import "./globals.css"

// Sets the dark class before first paint so dark mode never flashes light.
// Keep in sync with components/theme-provider.tsx (localStorage key "theme").
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`

export const metadata: Metadata = {
  title: APP_TITLE,
  description: "Legend Biotech finance hub: P&L, balance sheet, AR/AP, month-end close, profit split and FinOps on Snowflake",
  icons: { icon: LOGO_SRC },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <QueryProvider>
            <AssistantProvider>
              <AppHeader />
              <AssistantShell>{children}</AssistantShell>
            </AssistantProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
