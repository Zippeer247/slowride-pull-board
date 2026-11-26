// Rebuild fixtures/catalog.json from the public storefronts' /products.json
// (titles, variants, SKUs, images). Public data only, no keys needed.
//   npm run fixtures
import { writeFile } from "node:fs/promises";

const STORES = { garage: "https://slowride.com", supply: "https://slowridesupply.com" };
const PAGES = 4;

async function fetchProducts(base) {
  const out = [];
  for (let page = 1; page <= PAGES; page++) {
    const res = await fetch(`${base}/products.json?limit=250&page=${page}`, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`${base}: HTTP ${res.status}`);
    const { products } = await res.json();
    if (!products?.length) break;
    out.push(...products);
  }
  return out
    .filter((p) => p.variants?.some((v) => v.available !== false && v.sku))
    .map((p) => ({
      title: p.title,
      vendor: p.vendor,
      image: p.images?.[0]?.src ? `${p.images[0].src.split("?")[0]}?width=240` : null,
      variants: p.variants.filter((v) => v.sku).map((v) => ({ title: v.title, sku: v.sku })),
    }));
}

const garage = await fetchProducts(STORES.garage);
const supply = await fetchProducts(STORES.supply);
await writeFile(
  new URL("../fixtures/catalog.json", import.meta.url),
  JSON.stringify({ source: `storefronts ${new Date().toISOString()}`, garage, supply }, null, 1),
);
console.log(`garage: ${garage.length} products, supply: ${supply.length} products`);
