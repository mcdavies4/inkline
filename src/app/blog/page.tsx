import type { Metadata } from "next";
import Link from "next/link";
import { allPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Inkline Blog — electronic signatures & signing documents",
  description:
    "Plain-English guides to electronic signatures, signing PDFs online, and document law in Nigeria and beyond — from the team at Inkline.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Inkline Blog — electronic signatures & signing documents",
    description: "Guides to e-signatures, signing PDFs online, and document law.",
    url: "https://inklinesign.com/blog",
    type: "website",
    images: ["/og-image.png"],
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function BlogIndex() {
  const posts = allPosts();
  return (
    <main className="blog-wrap">
      <header className="blog-head">
        <Link href="/" className="blog-brand">Inkline</Link>
        <Link href="/app" className="blog-cta">Sign a document →</Link>
      </header>

      <div className="blog-hero">
        <h1>The Inkline blog</h1>
        <p>Plain-English guides to electronic signatures, signing documents, and getting paperwork done without the paperwork.</p>
      </div>

      <ul className="blog-list">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`}>
              <span className="blog-date">{formatDate(p.date)} · {p.readingMins} min read</span>
              <h2>{p.title}</h2>
              <p>{p.excerpt}</p>
              <span className="blog-more">Read →</span>
            </Link>
          </li>
        ))}
      </ul>

      <footer className="foot">
        <nav>
          <Link href="/">Home</Link>
          <Link href="/app">Sign a document</Link>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </footer>
    </main>
  );
}
