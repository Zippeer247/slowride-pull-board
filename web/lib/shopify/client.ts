// Live Shopify source: client-credentials token + Admin GraphQL. Read-only (read_orders).

import { config } from "../config";
import type { OrderSource, ShopifyOrder, StoreId } from "../types";
import { ORDERS_QUERY, ordersSearch } from "./queries";

const MAX_PAGES = 8;

interface Token {
  value: string;
  expiresAt: number;
}
const tokens = new Map<StoreId, Token>();

async function token(store: StoreId): Promise<string> {
  const cached = tokens.get(store);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;
  const s = config().stores[store];
  if (!s.clientId || !s.clientSecret) throw new Error(`${store}: Shopify client id/secret not set`);
  const res = await fetch(`https://${s.domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: s.clientId, client_secret: s.clientSecret }),
  });
  if (!res.ok) throw new Error(`${store}: token request failed (${res.status})`);
  const j = (await res.json()) as { access_token: string; expires_in?: number };
  tokens.set(store, { value: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000 });
  return j.access_token;
}

async function gql<T>(store: StoreId, query: string, variables: Record<string, unknown>): Promise<T> {
  const c = config();
  const s = c.stores[store];
  const res = await fetch(`https://${s.domain}/admin/api/${c.apiVersion}/graphql.json`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-shopify-access-token": await token(store) },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (res.status === 401) tokens.delete(store);
  if (!res.ok) throw new Error(`${store}: Shopify ${res.status}`);
  const j = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (j.errors?.length) throw new Error(`${store}: ${j.errors.map((e) => e.message).join("; ")}`);
  return j.data as T;
}

interface OrdersPage {
  orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyOrder[] };
}

export const liveSource: OrderSource = {
  async listOrders(store, since) {
    const out: ShopifyOrder[] = [];
    let after: string | null = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      const d: OrdersPage = await gql<OrdersPage>(store, ORDERS_QUERY, { query: ordersSearch(since), after });
      out.push(...d.orders.nodes);
      if (!d.orders.pageInfo.hasNextPage) break;
      after = d.orders.pageInfo.endCursor;
    }
    return out;
  },
};
