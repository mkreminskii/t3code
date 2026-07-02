# T3 Code

T3 Code is a minimal web GUI for coding agents (currently Codex, Claude, Cursor, GitHub Copilot, and OpenCode, more coming soon).

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, Cursor, GitHub Copilot, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
> - GitHub Copilot: install [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli) and run `copilot login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run the web app from this fork

This fork is meant to be run from source.

```bash
git clone https://github.com/mkreminskii/t3code.git
cd t3code
git checkout codex/copilot-cli-support
corepack pnpm install
corepack pnpm build
node apps/server/dist/bin.mjs serve
```

To make the server reachable outside localhost, pass a host:

```bash
node apps/server/dist/bin.mjs serve --host 0.0.0.0
```

The server prints a pairing URL for the web app after startup.

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

There's no public docs site yet, checkout the miscellaneous markdown files in [docs](./docs).

## Documentation

- [Getting started](./docs/getting-started/quick-start.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider guides](./docs/providers/codex.md)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

## If you REALLY want to contribute still.... read this first

### Install `vp`

T3 Code uses Vite+ so you'll need to install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

Checkout their getting started guide for more information: https://viteplus.dev/guide/

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
