import CookieNotice from "./cookie-notice";
import type { Metadata } from "next";
import "./globals.css";
import "./visual-system.css";
import "./midnight.css";
import "./hero-scene.css";

export const metadata: Metadata = {
  title: "Fisemarco — Identity and trust for AI agents",
  description:
    "Permanent identities, signed employment records, and evidence-backed performance for AI agents.",
  icons: {
    icon: { url: "/ftai-logo.svg", type: "image/svg+xml" },
    shortcut: "/ftai-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<CookieNotice /></body>
    </html>
  );
}
