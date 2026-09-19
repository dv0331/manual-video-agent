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
  title: "Manuals to Assembly Video",
  description:
    "Upload an instruction manual. The agent extracts the procedure and builds a video of a person assembling the product, step by step.",
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
                ASSEMBLE / MEDIA
              </span>
              <span className="text-sm font-medium">Manuals to Assembly Video</span>
            </Link>
            <p className="hidden text-xs text-muted-foreground sm:block">
              A person assembling the product. No invented hardware.
            </p>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
