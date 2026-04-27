import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Visibility Scanner — SEO · AEO · GEO",
  description:
    "Analyze your website's visibility for search engines, answer engines, and AI platforms. Get a scored report with actionable recommendations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
