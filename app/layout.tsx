import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "Assemble — the assembly film",
  description:
    "The goal is a chaptered movie of a person assembling the real parts. Open a manual; the agent plans, shoots, judges, and cuts the reel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border/80">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] tracking-[0.22em] text-primary">
                ASSEMBLE
              </span>
              <span className="text-sm font-medium">The assembly film</span>
            </Link>
            <a
              href="/#make-the-film"
              className="hidden text-xs text-muted-foreground hover:text-foreground sm:block"
            >
              Goal first. Then the reel that gets you there.
            </a>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
