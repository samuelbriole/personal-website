# Samuel Briole Personal Website

Source for [samuelbriole.com](https://samuelbriole.com), a personal website built with Astro. The site presents Samuel Briole's background, Spiko work, public writing, talks, and social links.

## Stack

- Astro 7 static site
- React 19 integration for React components
- TypeScript
- Tailwind CSS v4 through `@tailwindcss/vite`
- shadcn-style UI components in `src/components/ui/`
- pnpm 11.8.0

## Requirements

- Node 24, matching `.nvmrc`
- pnpm 11.8.0, matching `package.json`

If you use `nvm`:

```sh
nvm use
corepack enable
pnpm install
```

## Commands

Run commands from the repository root.

| Command             | Description                                                          |
| ------------------- | -------------------------------------------------------------------- |
| `pnpm install`      | Install dependencies                                                 |
| `pnpm dev`          | Start the local Astro dev server, usually at `http://localhost:4321` |
| `pnpm build`        | Build the production site into `dist/`                               |
| `pnpm preview`      | Preview the production build locally                                 |
| `pnpm lint`         | Run `oxlint`                                                         |
| `pnpm format:check` | Check formatting for `src/` with `oxfmt`                             |
| `pnpm format`       | Format `src/` with `oxfmt`                                           |
| `pnpm astro check`  | Run Astro and TypeScript diagnostics                                 |

## Project Structure

```text
.
├── public/
│   ├── CNAME
│   ├── effect-logo.svg
│   ├── favicon.ico
│   ├── samuel-portrait.jpg
│   └── spiko-logo.svg
├── src/
│   ├── components/ui/
│   ├── layouts/Layout.astro
│   ├── lib/utils.ts
│   ├── pages/index.astro
│   └── styles/globals.css
├── astro.config.mjs
├── package.json
└── pnpm-workspace.yaml
```

Key files:

- `src/pages/index.astro` contains the page content and build-time Spiko public stats loading.
- `src/layouts/Layout.astro` defines the shared HTML shell, metadata, canonical URL, and global stylesheet import.
- `src/styles/globals.css` contains Tailwind imports, theme variables, and global styles.
- `public/` contains static files served from the site root.

## Data

The homepage fetches public Spiko stats at build time from `https://public-api.spiko.io/v0`. If the API is unavailable or returns incomplete data, the page falls back to conservative public milestone values so builds can continue.

Because the stats are rendered statically, production data freshness depends on rebuild frequency.

## Deployment

The site is deployed to GitHub Pages by `.github/workflows/deploy.yaml`.

- Pushes to `main` trigger a build and deployment.
- A daily scheduled workflow rebuilds the static site at `06:00 UTC` so build-time stats stay fresh.
- `public/CNAME` configures the custom domain `samuelbriole.com`.

## Quality Checks

Before merging changes, run:

```sh
pnpm lint
pnpm format:check
```

There is no test script in this project. Use `pnpm astro check` when you need Astro or TypeScript diagnostics.
