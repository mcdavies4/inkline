import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, allPosts, AUTHOR, type Post } from "@/lib/posts";

const BASE = "https://inklinesign.com";

export function generateStaticParams() {
  return allPosts().map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPost(params.slug);
  if (!post) return {};
  const url = `/blog/${post.slug}`;
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
      modifiedTime: post.updated ?? post.date,
      images: ["/og-image.png"],
    },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: ["/og-image.png"] },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function Article({ params }: { params: { slug: string } }) {
  const post = getPost(params.slug);
  if (!post) notFound();
  const related = (post.related ?? []).map(getPost).filter((p): p is Post => Boolean(p));

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Person", name: AUTHOR },
    publisher: {
      "@type": "Organization",
      name: "Inkline",
      logo: { "@type": "ImageObject", url: `${BASE}/icon.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${BASE}/blog/${post.slug}` },
    image: `${BASE}/og-image.png`,
  };
  const faqLd = post.faq && post.faq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      }
    : null;
  const jsonLd = faqLd ? [articleLd, faqLd] : articleLd;

  return (
    <main className="blog-wrap">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="blog-head">
        <Link href="/" className="blog-brand">Inkline</Link>
        <Link href="/app" className="blog-cta">Sign a document →</Link>
      </header>

      <article className="article">
        <p className="article-kicker"><Link href="/blog">← All articles</Link></p>
        <h1>{post.title}</h1>
        <p className="article-meta">{formatDate(post.date)} · {post.readingMins} min read · {AUTHOR}</p>

        <div className="article-body" dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />

        {post.faq && post.faq.length > 0 && (
          <section className="article-faq">
            <h2>Frequently asked questions</h2>
            {post.faq.map((f, i) => (
              <div key={i} className="faq-item">
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </section>
        )}

        <aside className="article-cta">
          <h3>Get a document signed in about 20 seconds</h3>
          <p>No app, no account. Send a PDF, the other person signs from their phone, everyone gets the copy. Free for 7 days.</p>
          <Link className="primary" href="/app" style={{ display: "inline-block", textDecoration: "none" }}>Send a PDF for signing →</Link>
        </aside>

        {related.length > 0 && (
          <section className="article-related">
            <h2>Keep reading</h2>
            <ul>
              {related.map((r) => (
                <li key={r.slug}><Link href={`/blog/${r.slug}`}>{r.title}</Link></li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <footer className="foot">
        <nav>
          <Link href="/">Home</Link>
          <Link href="/blog">Blog</Link>
          <Link href="/app">Sign a document</Link>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
        </nav>
      </footer>
    </main>
  );
}
