/**
 * Navigation - single source of truth.
 *
 * Feeds four renderings from one data set (edit here → all four update):
 *  1. Header primary links        (src/components/site/Header.astro)
 *  2. Mega-nav overlay sections   (src/components/site/MegaNav.astro)
 *  3. Mobile-menu inline groups   (src/components/site/MobileMenu.astro)
 *  4. Footer link columns         (src/components/site/Footer.astro)
 *
 * In the legacy site the overlay markup was injected by app.js at runtime and
 * the mobile groups were cloned from it in the browser. Here everything is
 * server-rendered static HTML - same pixels, but every link is crawlable.
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
            { label: 'Equity', href: '/equity' },
            { label: 'Currency', href: '/currency' },
            { label: 'Commodities', href: '/commodities' },
            { label: 'Margin Trading Facility (MTF)', href: '/mtf' },
            { label: 'Derivatives', href: '/derivatives' },
            { label: 'Bonds', href: '/bonds' },
            { label: 'Global Investing', href: '/globalinvesting' },
          ],
          [
            { label: 'Mutual Funds', href: '/mutualfunds' },
            { label: 'ETFs', href: '/etf' },
            { label: 'National Pension Scheme (NPS)', href: '/nps' },
            { label: 'NFO', href: '/nfo' },
            { label: 'IPO', href: '/ipo' },
            { label: 'Fixed Deposit', href: '/fixeddeposit' },
          ],
        ],
      },
      {
        title: 'Featured',
        linkGroups: [
          [
            { label: 'Loan Against Mutual Funds', href: '/loanagainstmutualfund' },
            { label: 'Loan Against Stocks', href: '/loanagainstshares' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View All Products', href: '/products' },
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
            { label: 'Technical Research', href: '/technicalanalysis' },
            { label: 'Fundamental Research', href: '/fundamentalanalysis' },
            { label: 'Mutual Fund Research', href: '/mutualfundanalysis' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View Research', href: '/researchhub' },
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
            { label: 'SIP Calculator', href: '/sipcalculator' },
            { label: 'Lumpsum Calculator', href: '/lumpsumcalculator' },
            { label: 'Fixed Deposit Calculator', href: '/fdcalculator' },
            { label: 'SWP Calculator', href: '/swpcalculator' },
            { label: 'NPS Calculator', href: '/npscalculator' },
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
            { label: 'Contact & Help', href: '/contactus' },
            { label: 'Grievance Redressal', href: '/grievanceredressal' },
            { label: 'Regulatory & Compliance', href: '/regulatorydocuments' },
          ],
        ],
      },
    ],
    viewAll: { label: 'View All Support', href: '/contactus' },
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
  { label: 'Products', href: '/products', panel: 'products' },
  { label: 'Research Centre', href: '/researchhub', panel: 'research-centre' },
  { label: 'Calculators', href: '/calculators', panel: 'calculators' },
  { label: 'Support', href: '/contactus', panel: 'support' },
  { label: 'Become a Partner', href: '/becomeapartner' },
];

export const headerActions = {
  login: { label: 'Login', href: '#' },
  cta: { label: 'Open A Demat Account', href: '/opendemataccount' },
};

/* ------------------------------------------------------------------ */
/* Footer (V4 wireframe: brand/contact block, five link columns,       */
/* regulatory + BSE compliance bands, copyright bar)                   */
/* ------------------------------------------------------------------ */

export interface FooterColumn {
  title: string;
  links: NavLink[];
  /** Wide column: spans two grid tracks and lays its links out in two sub-columns (Products). */
  wide?: boolean;
}

export const footerBrand = {
  name: 'Shriram Financial Services',
  description:
    'A research-led, advisory-driven trading firm dedicated to helping clients achieve their financial goals through personalised advice.',
  addressLines: ['Shriram House, No. 4, Burkit Road,', 'T. Nagar, Chennai – 600 017'],
  phone: '1800 103 1212',
  email: 'support@shriramsecurities.com',
};

export const footerColumns: FooterColumn[] = [
  {
    title: 'Products',
    wide: true,
    links: [
      { label: 'Equity', href: '/equity' },
      { label: 'Currency', href: '/currency' },
      { label: 'Commodities', href: '/commodities' },
      { label: 'MTF', href: '/mtf' },
      { label: 'Derivatives', href: '/derivatives' },
      { label: 'Bonds', href: '/bonds' },
      { label: 'Global Investing', href: '/globalinvesting' },
      { label: 'Mutual Funds', href: '/mutualfunds' },
      { label: 'ETFs', href: '/etf' },
      { label: 'NPS', href: '/nps' },
      { label: 'NFO', href: '/nfo' },
      { label: 'IPO', href: '/ipo' },
      { label: 'Fixed Deposit', href: '/fixeddeposit' },
      { label: 'LAMF', href: '/loanagainstmutualfund' },
      { label: 'LAS', href: '/loanagainstshares' },
    ],
  },
  {
    title: 'Legal & Compliance',
    links: [
      { label: 'Regulatory Documents', href: '/regulatorydocuments' },
      { label: 'Investor Charter', href: '/regulatorydocuments/investorcharter' },
      { label: 'Mandatory Member Details', href: '/regulatorydocuments/mandatorymemberdetails' },
      { label: 'Grievance Redressal', href: '/grievanceredressal' },
      { label: 'Privacy Policy', href: '/privacypolicy' },
      { label: 'Terms & Conditions', href: '/termsandconditions' },
      { label: 'Terms of Use Mobile App', href: '/termsofusepurse' },
      { label: 'SEBI SCORES', href: 'https://scores.sebi.gov.in' },
    ],
  },
  {
    title: 'Research',
    links: [
      { label: 'Research Centre', href: '/researchhub' },
      { label: 'Technical Research', href: '/technicalanalysis' },
      { label: 'Fundamental Research', href: '/fundamentalanalysis' },
      { label: 'Mutual Fund Research', href: '/mutualfundanalysis' },
    ],
  },
  {
    title: 'Calculators',
    links: [
      { label: 'SIP Calculator', href: '/sipcalculator' },
      { label: 'Lumpsum Calculator', href: '/lumpsumcalculator' },
      { label: 'SWP Calculator', href: '/swpcalculator' },
      { label: 'FD Calculator', href: '/fdcalculator' },
      { label: 'NPS Calculator', href: '/npscalculator' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/aboutus' },
      { label: 'Contact Us', href: '/contactus' },
      { label: 'Become a Partner', href: '/becomeapartner' },
      { label: 'Open Demat Account', href: '/opendemataccount' },
      { label: 'Explore Antara', href: '/antara' },
      { label: 'Karnataka Bank Customers', href: '/karnatakabankcustomers' },
      { label: 'Site Map', href: '/sitemap' },
    ],
  },
];

export interface FooterComplianceBand {
  title: string;
  /** Paragraphs; `strong` renders as an emphasised lead-in before `text`. */
  paragraphs: { strong?: string; text: string }[];
}

export const footerCompliance: FooterComplianceBand[] = [
  {
    title: 'Regulatory Information',
    paragraphs: [
      {
        text: 'Shriram Financial Services Private Limited, a member of NSE & BSE. SEBI Registration Nos: NSE-CM: INB231103833 | NSE-FO: INF231103833 | NSE-CDS: INE231103833 | BSE-CM: INB011103839 | BSE-FO: INF011103839 | BSE-CDS: INE011103839 | CDSL DP: IN-DP-194-2016. AMFI ARN: 29483. IRDAI Registration No. CA0165. SEBI Research Analyst: INH200009624.',
      },
      {
        strong: 'Attention Investors:',
        text: ' Prevent unauthorised transactions in your Trading / Demat account. Update your mobile number and email id with your Stock Broker / Depository Participant. Receive information of your transactions directly from NSE, BSE, CDSL on your email and mobile. KYC is a one-time exercise while dealing in securities markets. Once KYC is done through a SEBI registered intermediary, you need not undergo the same process again when you approach another intermediary. No need to issue cheques by investors while subscribing to IPO - just write the bank account number and sign in the application form to authorise your bank to make payment in case of allotment. Investments in securities market are subject to market risks. Read all the related documents carefully before investing.',
      },
    ],
  },
  {
    title: 'BSE Disclaimer',
    paragraphs: [
      {
        text: 'The Stock Exchange, Mumbai is not in any manner answerable, responsible or liable to any person or persons for any acts of omission or commission, errors, mistakes and/or violation, actual or perceived, by us or our partners, agents, associates etc., of any of the Rules, Regulations, Bye-laws of the Stock Exchange, Mumbai, SEBI Act or any other laws in force from time to time.',
      },
      {
        text: 'The Stock Exchange, Mumbai is not answerable, responsible or liable for any information on this Website or for any services rendered by our employees, our servants, and us.',
      },
    ],
  },
];

export const footerLegal = {
  copyright: '© 2026 Shriram Financial Services Private Limited. All rights reserved.',
  registration: 'SEBI Registered · AMFI ARN-29483',
};
