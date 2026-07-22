import LandingChat from "./LandingChat";

const WA_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
const WA_LINK = WA_NUMBER
  ? `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent("Hi Inkline")}`
  : "#";

export const metadata = {
  title: "Inkline — sign documents inside WhatsApp",
  description:
    "Send a PDF. It gets signed in WhatsApp in 20 seconds. Both sides get the certified copy back in chat. No app, no account, no email.",
  robots: { index: true },
};

export default function Landing() {
  return <LandingChat waLink={WA_LINK} />;
}
