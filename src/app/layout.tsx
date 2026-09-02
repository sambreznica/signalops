import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Chrome } from "./ui/chrome";
import { Nav } from "./ui/nav";
import { loadReplayRun } from "@/lib/replay/load";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: "SignalOps",
  description: "Replay of committed investigation artefacts.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  const run = loadReplayRun();
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-canvas text-primary font-sans">
        <div className="mx-auto max-w-[1280px] px-4 py-2">
          <header className="sticky top-0 z-30 bg-canvas flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border py-2">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <p className="label">SignalOps</p>
              <Nav />
            </div>
            <Chrome run={run} />
          </header>
          <main className="pt-3 pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
