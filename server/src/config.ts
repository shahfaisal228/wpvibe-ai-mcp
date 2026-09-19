function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeSiteUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1"
  ) {
    throw new Error("WP_SITE_URL must use HTTPS for a remote WordPress site.");
  }
  return url.toString().replace(/\/$/, "");
}

const sharedToken = required("MCP_SHARED_TOKEN");
if (sharedToken.length < 32) {
  throw new Error("MCP_SHARED_TOKEN must be at least 32 characters.");
}

const allowedHosts = (
  process.env.MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1"
)
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)
  .map((value) => {
    if (value.includes("://")) {
      return new URL(value).hostname.toLowerCase();
    }
    return value.replace(/:\d+$/, "");
  });

export const config = {
  wpSiteUrl: normalizeSiteUrl(required("WP_SITE_URL")),
  wpUsername: required("WP_USERNAME"),
  wpAppPassword: required("WP_APP_PASSWORD"),
  mcpSharedToken: sharedToken,
  port: Number(process.env.PORT ?? "3000"),
  allowedHosts,
};
