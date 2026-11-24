# Harvest

**Your year in code, seen from above.**

Harvest turns a GitHub contribution graph into terraced farmland. Each week is a terrace following the hillside's contour; each day is a paddy along it. Fallow days stay bare earth, busy days grow dense green, and your biggest shipping days flood with water.

Type a username, watch the flyover, walk through a few plates (longest growing season, the hours you keep, your most tended plot, your heaviest harvest), and take home a share card.

## How it works

- **Data.** One server route holds a GitHub token and calls the GraphQL API for the contribution calendar (which requires auth even for public data). Repo detail and commit times come from a second, parallel query; if GitHub is slow, the field renders without them. Results are cached for an hour with `"use cache"`.
- **Landscape.** `src/lib/terrain.ts` builds the geometry: nested contour curves that never cross, split into paddies, with a forest around the edge. It is plain data, so the same field is drawn to Canvas in the browser (`Landscape.tsx`) and to SVG for the share card (`svg.ts`).
- **Share card.** `/card/<username>` renders a 1200×630 PNG with Satori (`next/og`). It doubles as the Open Graph image and as an embed for a profile README.
- **Privacy.** Public data only. Private repositories are filtered out, and there is no login.

## Run it locally

```bash
cp .env.example .env.local   # add a GitHub token
npm install
npm run dev
```

Then open http://localhost:3000 and try `/mattpocock`.

## Put it on your GitHub profile

```md
[![My year in code, seen from above](https://<your-deployment>/card/<username>)](https://<your-deployment>/<username>)
```

## Stack

Next.js 16 (App Router, Cache Components), Canvas 2D, Satori via `next/og`, Hanken Grotesk.
