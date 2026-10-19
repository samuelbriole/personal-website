# AGENTS.md

- **Markdown:** Document intent and non-obvious constraints. Keep implementation details in code and configuration as the source of truth.
- **Hosting:** Preserve static GitHub Pages output. Add browser JavaScript only for required interactivity.
- **Generated files:** Edit sources or dependency declarations; leave `dist/`, `.astro/`, and `node_modules/` to project tools.

## Tooling

- **Astro:** Run dev/build/preview through project scripts. Vite+'s matching built-ins bypass Astro.
- **Diagnostics:** Use `pnpm check:astro`. Before upgrading `@astrojs/check` or `typescript`, read the compiler compatibility hook in [`.pnpmfile.mjs`](.pnpmfile.mjs).

## Completion

Code changes are ready when `pnpm check`, `pnpm test`, and `pnpm build` pass. Documentation-only changes require `pnpm format:check` to pass.

## Effect

Before writing or changing Effect code, read [`node_modules/effect/AGENTS.md`](node_modules/effect/AGENTS.md) in full and follow its required links.

For API questions that guide does not cover, consult the installed source in `node_modules/effect/src`.
