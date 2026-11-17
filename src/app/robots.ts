import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/sign/", "/place/", "/admin", "/dashboard", "/billing/", "/api/"],
    },
    sitemap: "https://inklinesign.com/sitemap.xml",
    host: "https://inklinesign.com",
  };
}
