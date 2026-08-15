import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLink } from "@/components/nav-link";
import { DashboardIcon, AnomalyIcon, HouseholdIcon } from "@/components/nav-icons";
import { ZapIcon } from "@/components/icons";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Energy Anomaly Detection",
  description: "Energy consumption anomaly detection dashboard",
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", Icon: DashboardIcon },
  { href: "/anomalies", label: "Anomalies", Icon: AnomalyIcon },
  { href: "/households", label: "Households", Icon: HouseholdIcon },
] as const;

// Shared brand mark for both the desktop sidebar and the mobile top bar.
function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white shadow-sm shadow-accent/40">
        <ZapIcon className="h-4 w-4" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold tracking-tight text-foreground">Energy Intelligence</p>
        <p className="text-xs text-foreground-subtle">Anomaly Detection</p>
      </div>
    </div>
  );
}

const SIDEBAR_LINK = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground";
const SIDEBAR_LINK_ACTIVE = "flex items-center gap-3 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent-hover ring-1 ring-inset ring-accent-border";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden bg-background text-foreground md:flex-row">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface md:flex">
          <div className="px-5 py-5">
            <Brand />
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-3">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <NavLink key={href} href={href} className={SIDEBAR_LINK} activeClassName={SIDEBAR_LINK_ACTIVE}>
                <Icon className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="border-t border-border px-5 py-4 text-xs text-foreground-subtle">
            Live from FastAPI backend
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 flex min-w-0 flex-col gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
          <Brand />
          <nav className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {NAV_ITEMS.map(({ href, label, Icon }) => (
              <NavLink
                key={href}
                href={href}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                activeClassName="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent-hover ring-1 ring-inset ring-accent-border"
              >
                <Icon className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
