import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavLink } from "@/components/nav-link";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-6 py-3 text-sm">
            <NavLink
              href="/"
              className="text-zinc-500 hover:underline dark:text-zinc-400"
              activeClassName="font-medium hover:underline"
            >
              Dashboard
            </NavLink>
            <NavLink
              href="/anomalies"
              className="text-zinc-500 hover:underline dark:text-zinc-400"
              activeClassName="font-medium hover:underline"
            >
              Anomalies
            </NavLink>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
