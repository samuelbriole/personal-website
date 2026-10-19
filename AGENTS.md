# AGENTS.md

## Setup

- Use Node 24 (`.nvmrc`) and `pnpm@11.8.0`; the README still has Astro starter `npm` commands, so trust `package.json` and CI.
- This is a single-package Astro app; `pnpm-workspace.yaml` only allows native builds for `esbuild` and `sharp`.

## Commands

- Install: `pnpm install`.
- Dev server: `pnpm dev`; production build: `pnpm build`; preview: `pnpm preview`.
- Before finishing code changes, run `pnpm lint` then `pnpm format:check`; CI runs exactly those checks.
- Formatting uses `oxfmt`, not Prettier: `pnpm format` rewrites `src/`.
- OpenCode auto-runs `oxfmt` after edits for `.js`, `.jsx`, `.ts`, `.tsx`, `.css`, and `.mjs`; `.astro` files are not matched by `oxfmt` here.
- No test script exists. For Astro/TypeScript diagnostics, use `pnpm astro check`.

## Structure

- Routes live in `src/pages/`; the current page entrypoint is `src/pages/index.astro`.
- The shared shell is `src/layouts/Layout.astro`, which imports global styles from `src/styles/globals.css`.
- React is enabled through `@astrojs/react`; shadcn-style React components live under `src/components/ui/`.
- Use `@/` imports for `src/*`; aliases are configured in `tsconfig.json` and `components.json`.

## Styling And Deploy

- Tailwind is v4 via `@tailwindcss/vite` in `astro.config.mjs`; there is no `tailwind.config.*`.
- shadcn config uses `new-york`, rose base color, CSS variables, and `src/styles/globals.css`.
- Site URL is `https://samuelbriole.com`; `public/CNAME` sets the GitHub Pages custom domain.
- GitHub Pages deploys on pushes to `main` via `.github/workflows/deploy.yaml`.
- Do not edit generated/ignored outputs: `dist/`, `.astro/`, or `node_modules/`.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
