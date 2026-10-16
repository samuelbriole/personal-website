# AGENTS.md

- Keep Markdown lean: document intent and non-obvious constraints, not dependency inventories, file maps, or implementation summaries.
- Preserve static GitHub Pages compatibility; add browser JavaScript only where interactivity requires it.
- Use project scripts for dev/build/preview, not Vite+'s plain-Vite built-ins.
- Use `pnpm check:astro`, not `pnpm astro check`, while the checker needs its isolated compiler. See `.pnpmfile.mjs` for the compatibility hook.
- Before finishing code changes, run `pnpm lint` then `pnpm format:check`, plus `pnpm check`, `pnpm test`, and `pnpm build`.
- Do not edit generated outputs in `dist/`, `.astro/`, or `node_modules/`.

## Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.
