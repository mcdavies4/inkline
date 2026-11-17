import type { Metadata } from "next";

// Private section — never list these in search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function NoIndexLayout({ children }: { children: React.ReactNode }) {
  return children;
}
