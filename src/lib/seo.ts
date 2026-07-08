/**
 * SEO - templated per-page metadata.
 *
 * Every page passes an `SEO` object to BaseLayout; the layout renders the
 * complete head: title, description, canonical, Open Graph, Twitter card and
 * JSON-LD. At 4,000-page scale metadata is generated, never hand-typed twice.
 */

export interface SEO {
  /** Page <title>. The site name suffix is appended automatically. */
  title: string;
  /** Meta + OG description. Unique per page. */
  description: string;
  /**
   * Path of this page, with trailing slash (e.g. "/products/equity/").
   * Combined with Astro.site to form the canonical + og:url.
   */
  path: string;
  /** og:type - defaults to "website". */
  ogType?: 'website' | 'article';
  /** Optional JSON-LD blocks (FAQPage, BreadcrumbList, Organization, …). */
  jsonLd?: Record<string, unknown>[];
  /** Set true to keep the page out of search indexes (e.g. drafts). */
  noindex?: boolean;
}

export const SITE_NAME = 'Shriram Financial Services';

/** Normalises to one sitewide convention: "About Us | Shriram Financial Services". */
export function fullTitle(title: string): string {
  // Strip any brand suffix a page may still carry (either separator), then
  // append the canonical `| SITE_NAME` so every <title> is consistent.
  const bare = title.replace(new RegExp(`\\s*[-|]\\s*${SITE_NAME}\\s*$`), '').trim();
  return `${bare} | ${SITE_NAME}`;
}

/* ------------------------------------------------------------------ */
/* JSON-LD builders - shared shapes used across many pages.            */
/* ------------------------------------------------------------------ */

export interface FAQEntry {
  question: string;
  /** Plain-text answer (no HTML). */
  answer: string;
}

export function faqPageSchema(faqs: FAQEntry[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: f.answer },
    })),
  };
}

export function breadcrumbSchema(
  crumbs: { name: string; path: string }[],
  site: string
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: new URL(c.path, site).href,
    })),
  };
}

export function organizationSchema(site: string): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    name: SITE_NAME,
    url: site,
    logo: new URL('/assets/logo.png', site).href,
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Shriram House, No. 4, Burkit Road, T. Nagar',
      addressLocality: 'Chennai',
      postalCode: '600017',
      addressCountry: 'IN',
    },
    telephone: '1800 103 1212',
  };
}
