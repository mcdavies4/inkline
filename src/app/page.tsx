import type { Metadata } from "next";
import LandingChat from "./LandingChat";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.inklinesign.com"),
  title: "Inkline — sign documents in Telegram",
  description:
    "Send a PDF, get it back signed. e-signatures over Telegram — no app to learn, no account, about 20 seconds.",
  openGraph: {
    title: "Inkline — sign documents in Telegram",
    description: "Send a PDF, get it back signed. e-signatures over Telegram.",
    images: ["/og-image.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Inkline — sign documents in Telegram",
    description: "Send a PDF, get it back signed. e-signatures over Telegram.",
    images: ["/og-image.png"],
  },
};

export default function Page() {
  return <LandingChat />;
}
