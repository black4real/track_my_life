# Kept

Kept is a personal tracker for the things you own, buy again, use, and maintain. Record when you bought something, how much you actually paid, how long you have had it, and when it last needed service.

## Features

- Add an item with only its name; dates, category, price, notes, and product link are optional.
- Keep a timeline of purchases, service, and personal use notes.
- Record purchase quantity, variant or size, and the total paid after discounts. Kept shows the per-unit amount and total units bought.
- Save variants such as sizes or colors with their own current listed prices.
- Add a public product link to load its image and current listed price when viewing the item. Shops may not expose every variant or price; variants can be added and updated manually.
- Search and filter your library, switch between light and dark themes, and export or restore a JSON backup.

## Run locally

Use Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run lint` | Check the code with ESLint |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build locally |

Run `npm run build` before `npm run start`.

## Data and privacy

Item records and the theme choice are saved in the current browser's local storage. There is no account or cloud sync. Use **Back up** to download a JSON file and **Restore** to load one later. Keep the backup somewhere safe; clearing the browser's site data removes locally saved records.

Product previews are requested by the app's server from public HTTPS product pages. The preview can only show details a shop makes available in page metadata. A shop may block automatic reading or omit variant information; purchase history and manually entered variant prices still work.

## Design notes

See [DESIGN.md](./DESIGN.md) for the visual concept, color system, typography, motion, and layout choices.
