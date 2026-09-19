import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as z from "zod/v4";
import type { WordPressClient } from "./wordpress.js";

const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_AUDIENCE = "homeglo-mcp";
const GITHUB_REPOSITORY = "shahfaisal228/wpvibe-ai-mcp";
const GITHUB_CONTROL_REF = "refs/heads/homeglo-control";
const githubJwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

const CommandSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/),
  action: z.enum([
    "site_info",
    "list_files",
    "read_file",
    "search_files",
    "create_draft",
    "preview_draft",
    "edit_file",
    "write_file",
    "publish_draft",
    "delete_draft",
  ]),
  args: z.record(z.string(), z.unknown()).default({}),
  confirmation: z.string().optional(),
});

export type HomeGloBridgeCommand = z.infer<typeof CommandSchema>;

export async function verifyGitHubActionsRequest(req: Request): Promise<void> {
  const header = req.header("authorization") ?? "";
  if (!header.startsWith("Bearer ")) {
    throw new Error("Missing GitHub Actions OIDC token.");
  }

  const token = header.slice(7);
  const { payload } = await jwtVerify(token, githubJwks, {
    issuer: GITHUB_ISSUER,
    audience: GITHUB_AUDIENCE,
  });

  if (payload.repository !== GITHUB_REPOSITORY) {
    throw new Error("GitHub repository is not authorized.");
  }
  if (payload.ref !== GITHUB_CONTROL_REF) {
    throw new Error("GitHub branch is not authorized.");
  }
  if (payload.event_name !== "push") {
    throw new Error("Only push-triggered commands are accepted.");
  }
}

async function requireDraft(wp: WordPressClient): Promise<void> {
  await wp.get("/draft-theme/preview");
}

function asArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function executeGitHubCommand(
  wp: WordPressClient,
  input: unknown,
): Promise<Record<string, unknown>> {
  const command = CommandSchema.parse(input);
  const args = asArgs(command.args);

  try {
    let result: unknown;

    switch (command.action) {
      case "site_info":
        result = await wp.get("/site-info");
        break;

      case "list_files":
        result = await wp.get("/file/list", {
          scope: typeof args.scope === "string" ? args.scope : "theme",
          directory: typeof args.directory === "string" ? args.directory : "",
          pattern: typeof args.pattern === "string" ? args.pattern : undefined,
        });
        break;

      case "read_file":
        result = await wp.post("/file/read", {
          scope: typeof args.scope === "string" ? args.scope : "theme",
          path: String(args.path ?? ""),
          start_line:
            typeof args.start_line === "number" ? args.start_line : undefined,
          end_line: typeof args.end_line === "number" ? args.end_line : undefined,
        });
        break;

      case "search_files":
        result = await wp.post("/file/search", {
          pattern: String(args.pattern ?? ""),
          case_sensitive:
            typeof args.case_sensitive === "boolean"
              ? args.case_sensitive
              : false,
          extensions: Array.isArray(args.extensions) ? args.extensions : undefined,
          max_results:
            typeof args.max_results === "number" ? args.max_results : 100,
        });
        break;

      case "create_draft":
        result = await wp.post("/draft-theme");
        break;

      case "preview_draft":
        result = await wp.get("/draft-theme/preview");
        break;

      case "edit_file":
        await requireDraft(wp);
        result = await wp.post("/file/edit", {
          path: String(args.path ?? ""),
          old_content: String(args.old_content ?? ""),
          new_content: String(args.new_content ?? ""),
        });
        break;

      case "write_file":
        await requireDraft(wp);
        result = await wp.post("/file/write", {
          path: String(args.path ?? ""),
          content: String(args.content ?? ""),
          expected_source_hash:
            typeof args.expected_source_hash === "string"
              ? args.expected_source_hash
              : undefined,
        });
        break;

      case "publish_draft":
        if (command.confirmation !== "PUBLISH_HOMEGLO_LIVE") {
          throw new Error(
            "Live publish requires confirmation PUBLISH_HOMEGLO_LIVE.",
          );
        }
        await requireDraft(wp);
        result = await wp.post("/draft-theme/publish", {
          expected_source_hash:
            typeof args.expected_source_hash === "string"
              ? args.expected_source_hash
              : undefined,
        });
        break;

      case "delete_draft":
        result = await wp.post("/draft-theme/delete");
        break;
    }

    return {
      ok: true,
      id: command.id,
      action: command.action,
      result,
      completed_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      id: command.id,
      action: command.action,
      error: error instanceof Error ? error.message : "Unknown error",
      completed_at: new Date().toISOString(),
    };
  }
}
