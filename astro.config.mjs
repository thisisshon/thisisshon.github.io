// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Shriram Financial Services - built to organisation scale (4,000+ pages).
// Static output, file-format extensionless URLs with NO trailing slash
// (/mutualfunds → mutualfunds.html); slugs carry no hyphens. Sitemap generated
// automatically from the page tree.
export default defineConfig({
  // UAT/draft deploy (GitHub Pages user site). For production, switch back to
  // the real domain: 'https://www.shriramfinancialservices.com'.
  site: 'https://thisisshon.github.io',
  trailingSlash: 'never',
  build: {
    // 'file' emits foo.html (served at /foo, no trailing slash) instead of the
    // directory index foo/index.html (which GitHub Pages 301s to /foo/).
    format: 'file',
  },
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
