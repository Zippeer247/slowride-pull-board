// Shapes returned by the Admin GraphQL orders query (lib/shopify/queries.ts).
// Mock fixtures must match these exactly, so swapping mock -> live changes nothing else.

export type StoreId = "garage" | "supply";

export interface ShopifyLineItem {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  currentQuantity: number;
  isGiftCard: boolean;
  image: { url: string } | null;
}

export interface ShopifyOrder {
  id: string; // gid://shopify/Order/123
  name: string; // "#1234"
  createdAt: string; // ISO
  cancelledAt: string | null;
  displayFinancialStatus: string | null; // PAID, PENDING, REFUNDED, VOIDED, ...
  sourceName: string | null; // "web", "pos", "shopify_draft_order", app id ...
  app: { id: string; name: string } | null;
  tags: string[];
  shippingAddress: { city: string | null } | null;
  shippingLines: { nodes: { title: string }[] };
  lineItems: { nodes: ShopifyLineItem[] };
}

export interface OrderSource {
  /** Orders created at or after `since`, newest first. */
  listOrders(store: StoreId, since: Date): Promise<ShopifyOrder[]>;
}

// What the screens get.

export type CardKind =
  | "slowride" // Garage shipping order
  | "pickup" // Garage in-store pickup (never reaches Supply)
  | "supply" // Supply's own web / draft order
  | "reship"; // Supply replacement order

export interface CardItem {
  title: string;
  variant: string | null;
  sku: string | null;
  qty: number;
  image: string | null;
}

export interface Card {
  key: string; // stable id used for pulled state
  number: string; // "#1234" as staff know it
  kind: CardKind;
  createdAt: string;
  items: CardItem[];
  /** Extra context, e.g. "Replacement for #1234". */
  note: string | null;
  /** Garage orders: has the Syncio / app-pushed copy reached Supply yet? */
  onSupply: boolean | null;
  rehearsal: boolean;
}

export interface PulledInfo {
  at: string;
  screen: string;
}

export interface BoardResponse {
  now: string;
  mode: "live" | "rehearsal";
  source: "mock" | "live";
  amberMin: number;
  redMin: number;
  alarmMin: number;
  toPull: Card[];
  justPulled: (Card & { pulled: PulledInfo })[];
  errors: string[];
}
