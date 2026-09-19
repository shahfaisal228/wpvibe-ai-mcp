import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { config } from "./config.js";
import { WordPressClient } from "./wordpress.js";

const wp = new WordPressClient(
  config.wpSiteUrl,
  config.wpUsername,
  config.wpAppPassword,
);

function asText(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

function toolError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Unknown error",
      },
    ],
    isError: true,
  };
}

function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: "homeglo-wordpress",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
      instructions:
        "Private HomeGlo WordPress connector. Prefer draft-theme edits and previews before publishing. Do not publish or delete unless the user explicitly asks.",
    },
  );

  server.registerTool(
    "homeglo_site_info",
    {
      description: "Read HomeGlo WordPress/site/theme/plugin information.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return asText(await wp.get("/site-info"));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_read_file",
    {
      description: "Read a file exposed by the WordPress connector.",
      inputSchema: z.object({
        scope: z.enum(["theme", "wp-content"]).default("theme"),
        path: z.string().min(1),
        start_line: z.number().int().positive().optional(),
        end_line: z.number().int().positive().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        return asText(await wp.post("/file/read", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_list_files",
    {
      description: "List files in the active/draft theme or wp-content scope.",
      inputSchema: z.object({
        scope: z.enum(["theme", "wp-content"]).default("theme"),
        directory: z.string().default(""),
        pattern: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        return asText(await wp.get("/file/list", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_search_files",
    {
      description: "Search theme source code for a text pattern.",
      inputSchema: z.object({
        pattern: z.string().min(1),
        case_sensitive: z.boolean().default(false),
        extensions: z.array(z.string()).optional(),
        max_results: z.number().int().min(1).max(200).default(100),
      }),
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      try {
        return asText(await wp.post("/file/search", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_create_draft_theme",
    {
      description: "Clone the live theme into WPVibe's draft sandbox for safe editing.",
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async () => {
      try {
        return asText(await wp.post("/draft-theme"));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_get_preview_url",
    {
      description: "Get the preview URL for the current draft theme.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        return asText(await wp.get("/draft-theme/preview"));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_edit_file",
    {
      description: "Surgically replace exact text in a draft theme file.",
      inputSchema: z.object({
        path: z.string().min(1),
        old_content: z.string(),
        new_content: z.string(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) => {
      try {
        return asText(await wp.post("/file/edit", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_write_file",
    {
      description: "Write the full contents of a draft theme file. Prefer homeglo_edit_file for small changes.",
      inputSchema: z.object({
        path: z.string().min(1),
        content: z.string(),
        expected_source_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (input) => {
      try {
        return asText(await wp.post("/file/write", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_publish_draft_theme",
    {
      description: "Publish the current draft theme to the live HomeGlo site. Use only after preview/review.",
      inputSchema: z.object({
        expected_source_hash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (input) => {
      try {
        return asText(await wp.post("/draft-theme/publish", input));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "homeglo_delete_draft_theme",
    {
      description: "Delete the current draft theme sandbox. Does not delete the live theme.",
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async () => {
      try {
        return asText(await wp.post("/draft-theme/delete"));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}

function safeTokenEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requireMcpToken(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!safeTokenEqual(supplied, config.mcpSharedToken)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

function requireAllowedHost(req: Request, res: Response, next: NextFunction) {
  const host = (req.header("host") ?? "").toLowerCase();
  if (!config.allowedHosts.includes(host)) {
    res.status(403).json({ error: "host_not_allowed" });
    return;
  }
  next();
}

const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: config.allowedHosts,
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "homeglo-mcp-server",
    version: "0.1.0",
  });
});

const mcpHandler = toNodeHandler(createMcpHandler(buildServer));

app.all(
  "/mcp",
  requireAllowedHost,
  requireMcpToken,
  (req, res) => void mcpHandler(req, res, req.body),
);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`HomeGlo MCP server listening on port ${config.port}`);
});
