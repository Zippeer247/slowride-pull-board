// Products used by the mock source. fixtures/catalog.json is rebuilt from the two
// public storefronts by `npm run fixtures`; the committed copy is a hand-written seed.
import data from "../../fixtures/catalog.json";

export interface CatalogProduct {
  title: string;
  vendor: string;
  image: string | null;
  variants: { title: string; sku: string }[];
}

export const CATALOG = data as unknown as { source: string; garage: CatalogProduct[]; supply: CatalogProduct[] };
