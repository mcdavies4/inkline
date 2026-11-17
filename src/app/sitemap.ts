import type { MetadataRoute } from "next";
import { allPosts } from "@/lib/posts";

const BASE = "https://inklinesign.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const posts = allPosts().map((p) => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.updated ?? p.date),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/app`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...posts,
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
