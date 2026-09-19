# HomeGlo self-hosted MCP server

This folder is the first private replacement for the hosted WPVibe gateway.

It does **not** replace WordPress yet. It talks to the REST routes already exposed by the WPVibe WordPress plugin, using a dedicated WordPress Application Password that you control.

## Current tools

Read-only:

- `homeglo_site_info`
- `homeglo_read_file`
- `homeglo_list_files`
- `homeglo_search_files`
- `homeglo_get_preview_url`

Write/draft workflow:

- `homeglo_create_draft_theme`
- `homeglo_edit_file`
- `homeglo_write_file`
- `homeglo_publish_draft_theme`
- `homeglo_delete_draft_theme`

The server intentionally does not expose arbitrary WP-CLI, arbitrary REST calls, raw SQL, plugin installation, or code-snippet execution in v0.1.

## Local setup

1. In WordPress, create a dedicated Application Password for the administrator account that will own the connector.
2. Copy `.env.example` to `.env` and fill in the values.
3. Install and run:

```bash
npm install
npm run typecheck
npm run start
```

4. Check:

```text
GET http://127.0.0.1:3000/health
```

The MCP endpoint is:

```text
POST http://127.0.0.1:3000/mcp
Authorization: Bearer <MCP_SHARED_TOKEN>
```

## Production rules

- Put the server behind HTTPS.
- Use a dedicated subdomain such as `mcp.homeglo.com.au`.
- Set `MCP_ALLOWED_HOSTS` to the exact public host.
- Never commit `.env`.
- Use a dedicated WordPress Application Password, not the user's normal password.
- Revoke that Application Password immediately if the MCP host is compromised.
- Keep the WordPress draft/preview workflow for theme edits.
- Do not expose arbitrary shell, raw SQL, or unrestricted file paths.

## Important ChatGPT limitation

The self-hosted MCP backend itself has no WPVibe quota. However, whether a ChatGPT account can invoke private custom MCP **write** tools depends on the ChatGPT plan/product surface. This server is standard MCP so it can also be used by other MCP-compatible clients.

## Next milestones

1. Test the server against HomeGlo using a dedicated Application Password.
2. Add OAuth for remote clients that require it.
3. Replace the hard-coded WPVibe service URLs in the WordPress fork with self-hosted configuration.
4. Add operation receipts, our own Ed25519 approval-signing key, and rollback.
5. Add HomeGlo/WooCommerce-specific tools after the base connector is stable.
