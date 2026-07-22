import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://inklinesign.com"),
  title: "Inkline — sign documents in WhatsApp",
  description:
    "Send a PDF, get it signed with a real handwritten signature, all inside WhatsApp. No app, no account, 20 seconds.",
  robots: { index: false }, // signing pages should never be indexed
  icons: { icon: "/favicon.png", apple: "/icon.svg" },
  openGraph: {
    title: "Inkline — sign documents in WhatsApp",
    description: "No app, no account. Send a PDF, get it signed in 20 seconds.",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkline — sign documents in WhatsApp",
    description: "No app, no account. Send a PDF, get it signed in 20 seconds.",
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1, // avoids iOS zoom-on-focus breaking the canvas
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
