# Samuel Briole Personal Website

Source for [samuelbriole.com](https://samuelbriole.com).

## Development

Use the versions pinned in [`.node-version`](.node-version) and [`package.json`](package.json).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

For other commands, consult `scripts` in `package.json`. Before contributing, read [`AGENTS.md`](AGENTS.md).

## Data freshness

Public stats refresh when the site is rebuilt, not when a visitor loads the page.
