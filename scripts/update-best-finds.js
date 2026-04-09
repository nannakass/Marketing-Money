/**
 * Nanna's Home Finds — Auto Best Finds Updater
 *
 * Fetches top products from Amazon Product Advertising API v5
 * and updates the Best Finds section in index.html.
 *
 * Runs via GitHub Actions every Sunday, or manually from the Actions tab.
 * Requires: AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG
 */

const {
  DefaultApi,
  SearchItemsRequest,
  PartnerType,
  Resources,
} = require('paapi5-nodejs-sdk');
const fs   = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────

const ACCESS_KEY  = process.env.AMAZON_ACCESS_KEY;
const SECRET_KEY  = process.env.AMAZON_SECRET_KEY;
const PARTNER_TAG = process.env.AMAZON_PARTNER_TAG || 'nannasbiz-20';

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing AMAZON_ACCESS_KEY or AMAZON_SECRET_KEY. Exiting.');
  process.exit(0);
}

const api = new DefaultApi(
  ACCESS_KEY,
  SECRET_KEY,
  'webservices.amazon.com',
  'us-east-1'
);

// ── Categories to search ──────────────────────────────────────────────────────

const SEARCHES = [
  {
    rank: '01',
    keyword: 'best kitchen appliances home cooking',
    fallback: { title: 'Instant Pot Duo 7-in-1', desc: 'The kitchen workhorse every home needs. Replaces 7 appliances in one footprint.', price: 'From $89', url: '#' },
  },
  {
    rank: '02',
    keyword: 'luxury hotel bed sheets soft bedroom',
    fallback: { title: 'Beckham Hotel Sheets', desc: 'Best budget sheets that feel anything but. Silky soft and wrinkle-resistant.', price: 'From $35', url: '#' },
  },
  {
    rank: '03',
    keyword: 'home storage organization bins closet',
    fallback: { title: 'mDesign Storage Bins', desc: 'The easiest way to get any closet, pantry, or cabinet under control fast.', price: 'From $24', url: '#' },
  },
  {
    rank: '04',
    keyword: 'cozy throw blanket living room soft',
    fallback: { title: 'Sherpa Throw Blanket', desc: 'Cozy, affordable, and looks great on any couch. Our most-recommended living room find.', price: 'From $29', url: '#' },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function formatPrice(listings) {
  const price = listings?.[0]?.price?.amount;
  return price ? `From $${Number(price).toFixed(2)}` : 'Check Price';
}

// ── Fetch one product from Amazon ─────────────────────────────────────────────

async function fetchProduct(keyword) {
  const req = new SearchItemsRequest();
  req.partner_tag   = PARTNER_TAG;
  req.partner_type  = PartnerType.ASSOCIATES;
  req.keywords      = keyword;
  req.search_index  = 'HomeAndKitchen';
  req.item_count    = 3;
  req.resources     = [
    Resources.ITEM_INFO_TITLE,
    Resources.ITEM_INFO_FEATURES,
    Resources.OFFERS_LISTINGS_PRICE,
    Resources.ITEM_LINKS_LISTING,
  ];

  try {
    const response = await api.searchItems(req);
    const items = response?.search_result?.items;
    if (!items || items.length === 0) return null;

    const item     = items[0];
    const title    = item.item_info?.title?.display_value;
    const features = item.item_info?.features?.display_values;
    const desc     = features?.[0] ?? 'A top-rated home essential.';
    const price    = formatPrice(item.offers?.listings);
    const url      = item.detail_page_url ?? '#';

    return {
      title: truncate(title, 52),
      desc:  truncate(desc, 95),
      price,
      url,
    };
  } catch (err) {
    console.warn(`⚠️  Could not fetch "${keyword}":`, err.message);
    return null;
  }
}

// ── Build HTML for one pick card ──────────────────────────────────────────────

function buildCard({ rank, title, desc, price, url }) {
  return `    <div class="pick-card">
      <div class="pick-rank">${rank}</div>
      <div class="pick-name">${title}</div>
      <div class="pick-desc">${desc}</div>
      <div class="pick-price">${price}</div>
      <a href="${url}" target="_blank" rel="noopener sponsored" class="pick-cta">Check Price →</a>
    </div>`;
}

// ── Update index.html ─────────────────────────────────────────────────────────

function updateIndex(cards) {
  const indexPath = path.join(__dirname, '..', 'index.html');
  let html = fs.readFileSync(indexPath, 'utf8');

  const newGrid = `<!-- AUTO-PICKS-START -->\n  <div class="picks-grid">\n${cards.join('\n')}\n  </div>\n  <!-- AUTO-PICKS-END -->`;

  // Replace between markers if they exist, otherwise replace the picks-grid block
  if (html.includes('<!-- AUTO-PICKS-START -->')) {
    html = html.replace(
      /<!-- AUTO-PICKS-START -->[\s\S]*?<!-- AUTO-PICKS-END -->/,
      newGrid
    );
  } else {
    html = html.replace(
      /<div class="picks-grid">[\s\S]*?<\/div>(\s*)<\/section>/,
      `${newGrid}\n</section>`
    );
  }

  fs.writeFileSync(indexPath, html, 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🛍️  Nanna\'s Home Finds — fetching top products...\n');

  const results = await Promise.all(
    SEARCHES.map(s => fetchProduct(s.keyword))
  );

  const cards = SEARCHES.map((s, i) => {
    const product = results[i] ?? s.fallback;
    console.log(`  ${s.rank}. ${product.title} — ${product.price}`);
    return buildCard({ rank: s.rank, ...product });
  });

  updateIndex(cards);

  const live  = results.filter(Boolean).length;
  const total = SEARCHES.length;
  console.log(`\n✅ Updated index.html — ${live}/${total} products from live API${live < total ? `, ${total - live} from fallback` : ''}.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
