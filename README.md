# Kept

Kept is a personal tracker for the things you own, buy again, use, and maintain. Keep purchase totals after discounts, variants, product links, service history, and personal notes in one quiet library.

## Features

- Add an item with only its name; dates, category, price, notes, and product link are optional.
- Keep purchases, service, and use notes in a dated timeline.
- Record purchase quantity and actual total paid, including discounts and bundles.
- Save product variants with separate listed prices.
- Add your own product photo or let Kept read public product page details when a shop allows it.
- Use email/password or Google sign-in with invited accounts. Records sync through Supabase and can also be edited in its Table Editor.
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
2. In the Supabase SQL Editor, run [`supabase/migrations/20261026000100_tracker.sql`](./supabase/migrations/20261026000100_tracker.sql). This creates the item, variant, and event tables, row-level security, and a private product-photo bucket.
3. In **Authentication → Sign In / Providers**, keep email/password enabled and enable Google after adding your Google OAuth client ID and secret. Add the Supabase callback URL shown on that provider page to the Google OAuth client.
4. In **Authentication → Settings**, disable public sign-ups. Add `http://localhost:3000/**` and your deployed Vercel domain with `/**` to the allowed redirect URLs. Set the site URL to your deployed Vercel address.
5. Invite your email from **Authentication → Users → Invite user**. Use the invitation link to open the app and sign in. Kept does not provide a public account-creation form.
6. Copy the project URL and publishable key from **Project Settings → API** into `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

7. Add the same two values to the Vercel project's Environment Variables, then redeploy. Do not put a Supabase `service_role` or secret key in this app or in a `NEXT_PUBLIC_` variable. Google OAuth credentials belong in Supabase's provider settings.

The default Supabase email sender is rate-limited. For regular invitations and password resets, configure a custom SMTP provider in Supabase. Google sign-in also requires a verified OAuth client and correct redirect URLs.

## Database editing

Use Supabase **Table Editor** to edit `items`, `variants`, and `events`. Each record includes a `user_id`; the app uses row-level security to keep signed-in users isolated. Item IDs connect variants and timeline events to their parent item. For product images, use the private `product-photos` bucket; the database stores a private object path rather than a public image URL.

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

Product previews are requested by the app's server from public HTTPS product pages. Shops may block automatic reads or omit variant information; manual purchase entry, product photos, and listed prices still work.

## Design notes

See [DESIGN.md](./DESIGN.md) for the visual concept, color system, typography, motion, and layout choices.
