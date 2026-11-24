import type { Metadata } from "next";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Harvest — your year in code, seen from above",
  description: "Your GitHub year as terraced farmland. Type a username, watch the flyover, share the field.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
