# Self-hosted MCP audit

Working branch: `homeglo-self-hosted-mcp`

## What the fork already gives us

The WordPress plugin already contains the expensive WordPress-side work:

- authenticated REST endpoints
- WordPress capability checks
- theme path sandboxing
- PHP syntax validation
- draft/preview/publish theme workflow
- content search/edit
- WP-CLI allowlisting
- operation receipts
- audit logging
- page-builder integrations

For a private HomeGlo connector, rebuilding those pieces from zero would be wasteful and riskier.

## Hosted WPVibe couplings found

The fork is **not** a full MCP server. The hosted service is still assumed in several places.

### 1. Connectivity check

`includes/class-wpvibe-connection-check.php`

Hard-coded remote preflight:

```text
https://mcp.wpvibe.ai/connection/preflight
```

This can be removed or pointed at our server later. It is not required for the first self-hosted REST/MCP bridge.

### 2. Admin setup UI

`includes/class-wpvibe-admin.php`

The admin page hard-codes the hosted MCP URL and WPVibe documentation/account links, including:

```text
https://mcp.wpvibe.ai/mcp
```

The first private server can run without changing this UI. We will replace it after the backend works.

### 3. Authorization notice / beacon

`includes/class-wpvibe-authorize-notice.php`

The current authorization flow trusts `mcp.wpvibe.ai` as a beacon host and uses a fixed WPVibe app id. Our final fork needs its own app identity and URLs.

### 4. Connection status signing

`includes/class-wpvibe-connection-status.php`

Connection observations must carry a WPVibe-signed proof. The route ultimately trusts keys from `WPVibe_Op_Proof_V2`.

### 5. Approval proof key

`includes/class-wpvibe-op-proof-v2.php`

The plugin currently embeds this hosted-service public key id:

```text
wpvibe-2026-09
```

Dangerous approved operations are cryptographically bound to signatures created by WPVibe's Worker. We cannot forge or reuse their private key. Our final fork must generate its own Ed25519 signing keypair, keep the private key only on our MCP backend, and ship only our public verification key in WordPress.

This is the most important hard dependency for full feature parity.

## v0.1 design decision

Do **not** attempt to clone the entire hosted WPVibe service before we can make one reliable request.

The first server uses:

```text
MCP client
   |
   | MCP over HTTPS
   v
our server
   |
   | Basic auth with a dedicated WordPress Application Password
   v
/wp-json/wpvibe/v1/*
   |
   v
HomeGlo WordPress
```

This immediately removes WPVibe's operation quota for the tools we expose.

We deliberately leave approval-only WP-CLI/code-snippet operations out of v0.1 because those routes rely on WPVibe's signing infrastructure.

## Security boundary for v0.1

- dedicated WordPress Application Password
- Application Password stored only as a deployment secret
- bearer token protecting the MCP endpoint
- HTTPS in production
- Host allowlist
- WordPress capability checks remain active
- draft theme before publish
- no raw SQL
- no arbitrary shell
- no arbitrary REST proxy
- no plugin install/update

## Next work

1. Deploy/test `server/`.
2. Confirm `homeglo_site_info` works.
3. Confirm read/search tools.
4. Create a draft and make a harmless CSS/text change.
5. Preview.
6. Roll back/delete the draft.
7. Only after that, test publish.
8. Then centralize service URLs in the WordPress fork.
9. Add our own approval signer and operation proof public key.
10. Add WooCommerce-specific tools.
