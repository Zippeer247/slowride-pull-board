# Slowride Order Pull Reminder

Reminder tool for pulling orders at Slowride Supply (slowridesupply.com).

## Status
Started 2026-11-25. In build-out phase, using mock data only.

## Approach
- **Only external dependency: the Shopify Admin API.** No other API keys.
- The whole app (logic + UI) is built and polished against **mock data shaped exactly like Shopify Admin API order responses**, before the real key is provided.
- Public storefront data from slowridesupply.com (e.g. product names/images) can be used to make mock orders realistic.
- When the key arrives, swap the mock data source for the live Shopify client. Nothing else should need to change.
- The key goes in `.env` (gitignored) and is never committed.

## Open questions
- Who gets reminded, and how (in-app dashboard, desktop notification, other)?
- When should reminders fire (fixed schedule, when new orders arrive, before a cutoff)?
