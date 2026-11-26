// Read-only. The app never sends a mutation.
// Field list must match ShopifyOrder in lib/types.ts.

export const ORDERS_QUERY = /* GraphQL */ `
  query PullBoardOrders($query: String!, $after: String) {
    orders(first: 25, after: $after, sortKey: CREATED_AT, reverse: true, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        displayFinancialStatus
        sourceName
        app { id name }
        tags
        shippingAddress { city }
        shippingLines(first: 5) { nodes { title } }
        lineItems(first: 30) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            currentQuantity
            isGiftCard
            image { url(transform: { maxWidth: 240, maxHeight: 240 }) }
          }
        }
      }
    }
  }
`;

/** POS is filtered in the query to keep Supply's page count low, and again in board.ts in case. */
export function ordersSearch(since: Date): string {
  return `created_at:>='${since.toISOString()}' AND NOT source_name:pos`;
}
