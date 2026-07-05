/**
 * Navigation — single source of truth.
 *
 * Feeds four renderings from one data set (edit here → all four update):
 *  1. Header primary links        (src/components/site/Header.astro)
 *  2. Mega-nav overlay sections   (src/components/site/MegaNav.astro)
 *  3. Mobile-menu inline groups   (src/components/site/MobileMenu.astro)
 *  4. Footer link columns         (src/components/site/Footer.astro)
 *
 * In the legacy site the overlay markup was injected by app.js at runtime and
 * the mobile groups were cloned from it in the browser. Here everything is
 * server-rendered static HTML — same pixels, but every link is crawlable.
 */

export interface NavLink {
  label: string;
  href: string;
}

/** A titled column of links inside a mega-nav section. */
export interface MegaNavColumn {
  /** Column heading, e.g. "Trade And Invest". Empty string = no heading. */
  title: string;
  /** One or two link lists rendered side by side within the column. */
  linkGroups: NavLink[][];
}

export interface MegaNavSection {
  /** Stable id used by data-section / data-panel attributes. */
  id: 'products' | 'research-centre' | 'calculators' | 'support';
  /** Label on the header link and the overlay sidebar item. */
  label: string;
  /** H2 heading inside the overlay panel. */
  heading: string;
  columns: MegaNavColumn[];
  /** Optional "View All …" link at the bottom of the panel. */
  viewAll?: NavLink;
}

/* ------------------------------------------------------------------ */
/* Mega-nav overlay sections (Products / Research Centre / Calculators */
/* / Support). Content parity with the legacy app.js-injected panel.   */
/* ------------------------------------------------------------------ */

export const megaNavSections: MegaNavSection[] = [
  {
    id: 'products',
    label: 'Products',
    heading: 'Products',
    columns: [
      {
        title: 'Trade And Invest',
        linkGroups: [
          [
            { label: 'Equity', href: '/products/equity/' },
            { label: 'Currency', href: '/products/currency/' },
            { label: 'Commodities', href: '/products/commodities/' },
            { label: 'Margin Trading Facility (MTF)', href: '/products/mtf/' },
            { label: 'Derivatives', href: '/products/derivative/' },
            { label: 'Bonds', href: '/products/bonds/' },
            { label: 'Global Investing', href: '/products/global-investing/' },
          ],
          [
            { label: 'Mutual Funds', href: '/products/mutual-funds/' },
            { label: 'ETFs', href: '/products/etf/' },
            { label: 'National Pension Scheme (NPS)', href: '/products/nps/' },
            { label: 'NFO', href: '/products/nfo/' },
            { label: 'IPO', href: '/products/ipo/' },
            { label: 'Fixed Deposit', href: '/products/fd/' },
          ],
        ],
      },
      {
        title: 'Featured',
        linkGroups: [
          [
            { label: 'Loan Against Mutual Funds', href: '/products/lamf/' },
            { label: 'Loan Against Stocks', href: '/products/las/' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View All Products', href: '/products/' },
  },
  {
    id: 'research-centre',
    label: 'Research Centre',
    heading: 'Research Centre',
    columns: [
      {
        title: '',
        linkGroups: [
          [
            { label: 'Technical Research', href: '/research/technical/' },
            { label: 'Fundamental Research', href: '/research/fundamental/' },
            { label: 'Mutual Fund Research', href: '/research/mutual-funds/' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View Research', href: '/research/' },
  },
  {
    id: 'calculators',
    label: 'Calculators',
    heading: 'Calculators',
    columns: [
      {
        title: 'Investment Calculators',
        linkGroups: [
          [
            { label: 'SIP Calculator', href: '/calculators/sip/' },
            { label: 'Lumpsum Calculator', href: '/calculators/lumpsum/' },
            { label: 'Fixed Deposit Calculator', href: '/calculators/fd/' },
            { label: 'SWP Calculator', href: '/calculators/swp/' },
            { label: 'NPS Calculator', href: '/calculators/nps/' },
          ],
        ],
      },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    heading: 'Support',
    columns: [
      {
        title: 'Get Help',
        linkGroups: [
          [
            { label: 'Contact & Help', href: '/support/' },
            { label: 'Grievance Redressal', href: '/support/grievance-redressal/' },
            { label: 'Regulatory & Compliance', href: '/about/regulatory/' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View All Support', href: '/support/' },
  },
];

/* ------------------------------------------------------------------ */
/* Header primary nav. Panel-backed items open the overlay; plain      */
/* items navigate.                                                     */
/* ------------------------------------------------------------------ */

export interface PrimaryNavItem extends NavLink {
  /** When set, the link opens this mega-nav overlay section. */
  panel?: MegaNavSection['id'];
}

export const primaryNav: PrimaryNavItem[] = [
  { label: 'Products', href: '/products/', panel: 'products' },
  { label: 'Research Centre', href: '/research/', panel: 'research-centre' },
  { label: 'Calculators', href: '/calculators/', panel: 'calculators' },
  { label: 'Support', href: '/support/', panel: 'support' },
  { label: 'Become a Partner', href: '/become-a-partner/' },
];

export const headerActions = {
  login: { label: 'Login', href: '#' },
  cta: { label: 'Open A Demat Account', href: '/demat/' },
};

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

export interface FooterColumn {
  title: string;
  links: NavLink[];
}

export const footerBrand = {
  name: 'Shriram Financial Services',
  description:
    'A research-led, advisory-driven trading firm dedicated to helping clients achieve their financial goals through personalised advice.',
  address: 'Shriram House, No. 4, Burkit Road, T. Nagar, Chennai – 600 017',
  phone: '1800 103 1212',
  email: 'support@shriramsecurities.com',
};

export const footerColumns: FooterColumn[] = [
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about/' },
      { label: 'Become a Partner', href: '/become-a-partner/' },
      { label: 'Open Demat Account', href: '/demat/' },
      { label: 'Regulatory', href: '#' },
      { label: 'Antara Platform', href: '#' },
      { label: 'Sitemap', href: '/sitemap/' },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'Research Centre', href: '/research/' },
      { label: 'Technical Analysis', href: '#' },
      { label: 'Fundamental Research', href: '#' },
      { label: 'Mutual Fund Picks', href: '#' },
      { label: 'Calculators', href: '/calculators/' },
      { label: 'Support', href: '/support/' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy/' },
      { label: 'Investor Charter', href: '/investor-charter/' },
      { label: 'Risk Disclosures', href: '#' },
      { label: 'Grievance Redressal', href: '/support/grievance-redressal/' },
      { label: 'SEBI SCORES', href: 'https://scores.sebi.gov.in' },
      { label: 'Contact Us', href: '/support/' },
      { label: 'Mandatory Member Details', href: '/mandatory-member-details/' },
    ],
  },
  {
    title: 'Products',
    links: [
      { label: 'Equity', href: '/products/equity/' },
      { label: 'Derivatives', href: '/products/derivative/' },
      { label: 'Commodities', href: '/products/commodities/' },
      { label: 'Currency', href: '/products/currency/' },
      { label: 'Mutual Funds', href: '/products/mutual-funds/' },
      { label: 'ETFs', href: '/products/etf/' },
      { label: 'IPO', href: '/products/ipo/' },
      { label: 'NPS', href: '/products/nps/' },
      { label: 'Bonds', href: '/products/bonds/' },
    ],
  },
];

export const footerLegal = {
  copyright:
    '© 2026 Shriram Securities Limited. All rights reserved. · SEBI Registered | ARN-29483',
};
