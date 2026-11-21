import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const GTM_ID = "GTM-PQ98F6T9";

export const metadata: Metadata = {
  metadataBase: new URL("https://inklinesign.com"),
  title: "Inkline — get documents signed in seconds",
  description:
    "Send a PDF and get it signed with a real signature in about 20 seconds. No app to install and no account for your signer — on the web or in Telegram.",
  // The site is indexable by default; private sections (sign, place, admin,
  // dashboard, billing) set their own noindex in their layouts.
  robots: { index: true, follow: true },
  icons: { icon: "/favicon.png", apple: "/icon.svg" },
  alternates: { canonical: "/" },
  openGraph: {
    title: "Inkline — get documents signed in seconds",
    description: "No app, no account for your signer. Send a PDF, get it signed in about 20 seconds — on the web or in Telegram.",
    url: "https://inklinesign.com",
    siteName: "Inkline",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkline — get documents signed in seconds",
    description: "No app, no account for your signer. Send a PDF, get it signed in about 20 seconds — on the web or in Telegram.",
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
      <body>
        {/* Google Tag Manager */}
        <Script id="gtm-init" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());`}
        </Script>
        <Script
          id="gtm-loader"
          strategy="afterInteractive"
          src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
        />
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
