import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#FAF8F2",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ),
  title: {
    default: "Salesforce sObject Payload Studio - Architect Toolkit",
    template: "%s - Salesforce sObject Payload Studio",
  },
  description:
    "Metadata-driven Salesforce REST payload builder. Connect live, describe any sObject, generate Table API + Composite payloads and export to JSON, cURL, JS or Apex.",
  authors: [{ name: "Kuldeep Singh" }],
  creator: "Kuldeep Singh",
  formatDetection: { email: false, address: false, telephone: false },
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${jetbrainsMono.variable} min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] antialiased flex flex-col`}>
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
