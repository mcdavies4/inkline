import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Send a document — Inkline",
  description: "Upload a PDF, add signers, and get it signed. No app, no account. Free for 14 days.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return children;
}
