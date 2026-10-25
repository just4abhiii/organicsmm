# Organic SMM

**Engagement bundles, provider-linked orders, and configurable delivery schedules.**

[Website](https://organicsmm.online) · [Repository](https://github.com/just4abhiii/organicsmm) · [Latest updates](VPS_UPDATES_20261025.md)

## Overview

Organic SMM provides customer ordering screens and administrative controls for social-media services, engagement bundles, provider selection, pricing, wallets, and support.

“Organic” is the product name and a scheduling-mode label. Gradual or randomized delivery does not prove that engagement is authentic or human-generated, establish platform approval, or guarantee compliance. Provider quality and permitted use require independent review.

## Features

- Platform-specific bundles with customer-adjustable quantities.
- Custom service names and uploaded icons.
- Provider-linked services and provider-supplied order limits.
- Custom-comment text entry only for providers that support it; random-comment services do not request custom text.
- Configurable delivery timelines and order-status views.
- Administrator-defined prices with INR-facing customer amounts.
- Versioned saved preferences and safeguards against stale quantities.

## Current first-visit defaults

For users without current explicitly saved custom preferences:

| Engagement | Quantity |
|---|---:|
| Views | 1,000 |
| Likes | 25 |
| Comments | 1 |
| Shares | 13 |
| Reposts | 11 |
| Saves | 12 |

Configured Reach/Impressions defaults to 500 per 1,000 views but starts **off** on Organic SMM. Customers can enable it using the visible switch. Provider limits still apply.

Pricing follows administrator configuration and selected quantity. Internal currency conversion remains in the existing system; the latest update is not a wallet or historical-order currency migration.

## Technology and layout

The repository contains a React 18 / TypeScript frontend built with Vite, Tailwind/shadcn-style components, TanStack Query, and Supabase-compatible database and function integrations. It is separate from Dhansmm.

| Directory | Purpose |
|---|---|
| `src/` | Application source and interface |
| `supabase/` | Database migrations and server-function integrations |
| `deploy/` | Deployment tools and documentation |
| `tests/vps/` | Standalone checks for recent VPS rules |

## Development

Use a Node.js version compatible with the installed tooling and pnpm 9, as declared in `package.json`.

```sh
git clone https://github.com/just4abhiii/organicsmm.git
cd organicsmm
pnpm install
pnpm dev
```

Configure your own development services and environment outside version control. Do not reuse production credentials or test against production wallets or provider accounts.

```sh
pnpm build
pnpm lint
pnpm test
node --test tests/vps/*.test.cjs
```

Standalone checks cover selected quantity, saved-preference, and pricing rules. They are not a complete security audit or proof of successful paid delivery.

## Deployment

Read [deployment documentation](deploy/README.md) and [latest VPS notes](VPS_UPDATES_20261025.md). Back up affected files and databases, review migrations, and test changes in an isolated environment.

A GitHub commit does not automatically apply migrations or establish that server functions have been deployed. The recent custom metadata migration adds nullable label/icon fields without replacing bundle records. Production customer and provider configuration data are not included in that update.

## Security and privacy

- Never commit tokens, passwords, signing keys, private keys, or secret-bearing environment files.
- Keep privileged server credentials and provider passwords out of browser code.
- Protect customer orders, balances, and administrator actions with authentication and authorization.
- Keep customer exports, database dumps, payment evidence, and support conversations out of public repositories.
- Review dependencies and permissions before release; passing tests do not constitute a security certification.
- Revoke/rotate accidentally published credentials and review repository history. Removing only the latest file does not remove earlier copies.

Report sensitive issues privately through a contact published by the repository owner. Do not put credentials or customer information in public issues. This README does not establish a monitored security mailbox or guaranteed response time.

## Responsible use

Follow GitHub's [Acceptable Use Policies](https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies), applicable law, provider agreements, and relevant social-platform rules. Do not use the application for spam, harassment, impersonation, unauthorized access, or misleading claims about engagement authenticity. Do not use purchased or automated engagement where the target platform prohibits it.

This README is descriptive, not a compliance certificate. Documentation cannot exempt a repository from review or guarantee protection from GitHub restrictions or suspension.

## Contributions and licensing

Keep changes scoped and include reproducible checks. Do not submit credentials or production data. Public visibility alone does not grant a software license; confirm reuse and redistribution rights with the owner. This README does not add or change a license.