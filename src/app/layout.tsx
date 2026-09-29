import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HR360 Business Plan",
  description: "Private sharing of the HR360 business plan.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
