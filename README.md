# Slowride Pull Board

Two monitors at Hesperia, one at the front and one in the back, each with a Fire TV Stick. They always show the web orders whose items need to be **pulled off the shop floor and set aside right now**, so a walk-in customer can't buy the last unit of something that already sold online.

Staff clear an order with the Fire TV remote (**OK** = pulled). Both screens update together.

```
Garage (slowride.com) ─┐  read-only Admin GraphQL     ┌─ Fire Stick FRONT (WebView app)
                       ├──► web/ on Vercel ◄──────────┤
Supply (slowridesupply)┘    merge + dedupe + pulled   └─ Fire Stick BACK  (WebView app)
                            state in Redis
```

## What it touches

| | |
|---|---|
| **Shopify** | **Read-only** on both stores (`read_orders`). It never writes, so money, stock and customer emails are untouched. |
| **Its own storage** | One Redis hash recording which orders were pulled, when, and from which screen. |

**When Syncio is late or misses an order**, the board still shows it:
- It watches **Garage directly**, so a slowride.com order shows up within about 30 seconds.
- When the Syncio or app-pushed copy later lands on Supply (tags `slowridegarage` + `#<number>`), it merges into the **same card**.
- If Garage can't be reached, the Supply copy is shown on its own instead.

**In-store pickups** (shipping line `11774 Hesperia Road`, no address) never reach Supply. They're shown with a PICKUP badge, because the item still has to come off the floor.

### Which orders appear
| Store | Shown | Hidden |
|---|---|---|
| Garage | Paid shipping orders and pickups | Cancelled, refunded or voided orders, POS (pop-ups) |
| Supply | Web orders, Syncio and app-pushed copies (merged), `reship` replacements, draft orders | POS sales, cancelled orders |
| Both | — | `rehearsal`/`training` orders, except in Rehearsal mode, which shows *only* those |

## Repo layout

- **`web/`**: Next.js app (the screens and the API), deployed to Vercel
  - `lib/board.ts`: all the order rules: classify, filter, merge Garage and Supply copies, sort, age colors. Covered by `lib/board.test.ts`.
  - `lib/shopify/mock.ts`: test orders generated from the clock (the same on every screen and server). Includes late or missing Syncio copies, pickups, reships, POS, cancellations and rehearsal orders.
  - `lib/shopify/client.ts`, `queries.ts`: the live Shopify client (client-credentials token, Admin GraphQL).
  - `lib/state.ts`: pulled state (Upstash Redis, or in-memory locally).
  - `app/display/Board.tsx`: the screen, driven by the remote.
  - `fixtures/catalog.json`: real products from both public storefronts, used by the mock orders. Refresh it with `npm run fixtures`.
- **`firetv/`**: the Android TV app sideloaded onto the sticks. A full-screen WebView that:
  - keeps the screen awake
  - starts itself on power-up
  - reconnects by itself
  - passes the remote's keys to the page
- **`docs/SETUP-FIRESTICK.md`**: step by step for setting up a monitor.

## Run it locally (test data)

```bash
cd web
npm install
npm test              # board rules
npm run dev           # http://localhost:3000/display?screen=front
```

In a browser, the arrow keys, **Enter** and **Esc** stand in for the remote. Open `?screen=front` and `?screen=back` side by side to watch them stay in sync. For a busier board, use `MOCK_ORDERS_PER_HOUR=10 npm run dev`.

## Deploy (Vercel)

1. Import the repo into Vercel with **Root Directory = `web`**.
2. **Storage → Marketplace → Upstash Redis** → connect it to the project. This sets `KV_REST_API_URL`/`TOKEN`, which the app reads.
3. Set the environment variables (see `web/.env.example`):
   - `DATA_SOURCE=mock` for now
   - `DISPLAY_KEY=<long random string>` (for example, from `openssl rand -hex 24`)
4. Open `https://<app>.vercel.app/display?screen=front&key=<DISPLAY_KEY>`.

## Fire TV app

```bash
cd firetv
./scripts/setup-toolchain.sh                                 # once: JDK 17, Gradle, Android SDK + adb into ~/.pullboard-toolchain
./scripts/build-apks.sh https://<app>.vercel.app <DISPLAY_KEY> # → dist/pullboard-front.apk, dist/pullboard-back.apk
./scripts/install.sh <stick IP> front                        # and again with the back stick's IP and "back"
```

Full monitor setup: [docs/SETUP-FIRESTICK.md](docs/SETUP-FIRESTICK.md).

## Going live with the Shopify keys

1. In each store, create or confirm a custom app with the **`read_orders`** scope and nothing else. Put its client id and secret in Vercel:
   - `SUPPLY_SHOPIFY_CLIENT_ID/SECRET`
   - `GARAGE_SHOPIFY_CLIENT_ID/SECRET`
2. **Rehearse.** Set `DATA_SOURCE=live` and `BOARD_MODE=rehearsal`, then:
   - Place a `rehearsal`-tagged test order on each store, plus one Garage pickup.
   - Check each one shows once and merges when its Syncio copy arrives.
   - Check it clears with the remote.
3. **Go live.** Set `BOARD_MODE=live` and `BOARD_START_AT=<now>`, so old orders don't flood the board.

To check against real data:
- `ordersSearch()` in `lib/shopify/queries.ts` filters out POS with `NOT source_name:pos`. If Shopify ignores that filter, `board.ts` still drops POS. Supply would just need more pages per poll.
- Supply order names (for example `#S1234` in the mock) are shown exactly as Shopify returns them.
