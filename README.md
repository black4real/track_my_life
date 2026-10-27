# Kept

Kept is a personal tracker for the things you own, buy again, use, and maintain. Keep purchase totals after discounts, variants, product links, service history, and personal notes in one quiet library.

## Features

- Add an item with only its name; dates, category, price, notes, and product link are optional.
- Keep purchases, service, and use notes in a dated timeline.
- Switch to a month calendar to browse dated events by day, with item photos and a list of that day’s activity.
- Use the **Routine** section to keep ordered morning and night product steps, track each period of use, and maintain a separate current/resolved concerns list.
- Link routine products to Library items or create routine-only products with their own photos.
- Record purchase quantity and actual total paid, including discounts and bundles.
- Add an item type and optional type-specific details. Clothing purchases can be logged one garment at a time with their own size, color, and paid amount.
- Save product variants with separate listed prices.
- Add your own product photo or let Kept read public product page details when a shop allows it. Product checks happen when you open an item or refresh it manually; successful prices form a history.
- Paste links from H&M, Myntra, Flipkart, Meesho, Amazon India, AJIO, Nykaa, quick-commerce shops, and Tata shopping brands. Kept suggests the shop and tries common public product metadata; other HTTPS product pages use the same general reader.
- Create an account with email/password or sign in with Google. Records sync through Supabase and can also be edited in its Table Editor.
- Export and restore a JSON backup. Kept asks before copying old browser records into a signed-in account.
- Switch between light and dark themes.

## Start locally

Use Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase environment values, Kept remains in local-browser mode. Follow the setup below to enable account sign-in and cloud sync. Open [http://localhost:3000](http://localhost:3000).

## Supabase setup

1. Create a Supabase project. The free plan is enough to get started; check its current limits and inactivity behavior on [Supabase pricing](https://supabase.com/pricing).
2. In the Supabase SQL Editor, run [`supabase/migrations/20261026000100_tracker.sql`](./supabase/migrations/20261026000100_tracker.sql), then [`supabase/migrations/20261026000200_store_name.sql`](./supabase/migrations/20261026000200_store_name.sql), [`supabase/migrations/20261026000300_item_details.sql`](./supabase/migrations/20261026000300_item_details.sql), [`supabase/migrations/20261026000400_product_price_history.sql`](./supabase/migrations/20261026000400_product_price_history.sql), [`supabase/migrations/20261027000100_product_groups.sql`](./supabase/migrations/20261027000100_product_groups.sql), and [`supabase/migrations/20261028000100_routine.sql`](./supabase/migrations/20261028000100_routine.sql), in that order. These create the private, per-user item, history, and Routine tables.
3. In **Authentication → Sign In / Providers**, keep email/password enabled and enable Google after adding your Google OAuth client ID and secret. Add the Supabase callback URL shown on that provider page to the Google OAuth client.
4. In **Authentication → Settings**, enable public sign-ups. Add `http://localhost:3000/**` and your deployed Vercel domain with `/**` to the allowed redirect URLs. Set the site URL to your deployed Vercel address. Email confirmation may be enabled; new users will need to confirm their email before signing in.
5. New users can create their own accounts from Kept’s sign-in screen. With email confirmation enabled, they must confirm their address before signing in. Google sign-in is available once its provider is configured.
6. Copy the project URL and publishable key from **Project Settings → API** into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

7. Add the same two values to the Vercel project's Environment Variables, then redeploy. Do not put a Supabase `service_role` or secret key in this app or in a `NEXT_PUBLIC_` variable. Google OAuth credentials belong in Supabase's provider settings.

8. Optional: to use Flipkart's official product lookup, register for the [Flipkart Affiliate APIs](https://affiliate.flipkart.com/api-docs/af_register.html), then set `FLIPKART_AFFILIATE_ID` and `FLIPKART_AFFILIATE_TOKEN` in `.env.local` and Vercel's server-side Environment Variables. Never prefix these with `NEXT_PUBLIC_`. Kept otherwise falls back to public product-page metadata. Flipkart credentials are not required to run the app.

The default Supabase email sender is rate-limited. For regular invitations and password resets, configure a custom SMTP provider in Supabase. Google sign-in also requires a verified OAuth client and correct redirect URLs.

## Database editing

Use Supabase **Table Editor** to edit `items`, `variants`, `events`, `product_price_observations`, and `routine_data`. Each row includes a `user_id`; the app uses row-level security to keep signed-in users isolated. Item IDs connect variants, timeline events, and price observations to their parent item. Routine products, periods, and concerns are stored together per account in `routine_data`. For product images, use the private `product-photos` bucket; the database stores a private object path rather than a public image URL.

Records you already saved in this browser remain there. After the first successful sign-in, Kept offers a one-time import and shows the number of items and photos before copying anything. Choosing **Not now** leaves the old browser records untouched. You can still use **Back up** and **Restore** at any time.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Check the code with ESLint |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build locally |

Run `npm run build` before `npm run start`.

## Data and privacy

When Supabase is configured, each authenticated account can access only its own item records and product photos. The browser never receives an admin or service-role secret. Your theme stays in this browser. If Supabase is not configured, records continue to use this browser's local storage as before.

Product previews are requested by the app's server from public HTTPS product pages. When the optional affiliate credentials are configured, Flipkart product IDs are looked up through its official API first. Other links use public Open Graph, Twitter Card, and Schema.org metadata. Kept does not log in to shops or bypass their protections. A price is saved only when the page/API exposes an unambiguous amount; ambiguous variants leave price blank. Checks happen when you open an item or refresh manually, with no scheduled polling. If a shop blocks reads, the last good data remains and you can edit the photo and listed price. The purchase amount you actually paid stays separate from the fetched listed price. The optional delivery PIN is saved in your Supabase account metadata; currently the public-page readers do not send it to shops.

## Design notes

See [DESIGN.md](./DESIGN.md) for the visual concept, color system, typography, motion, and layout choices.
