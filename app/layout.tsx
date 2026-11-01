import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AquaTrace · Connected water. Clearer insight.",
  description:
    "Distributed water-quality monitoring. Track pollution, compare waterways, and investigate changes.",
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
