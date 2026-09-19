export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export class WordPressClient {
  private readonly authHeader: string;

  constructor(
    private readonly siteUrl: string,
    username: string,
    appPassword: string,
  ) {
    this.authHeader = "Basic " + Buffer.from(`${username}:${appPassword}`, "utf8").toString("base64");
  }

  async get(route: string, query?: Record<string, string | number | boolean | undefined>): Promise<JsonValue> {
    const url = this.url(route);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return this.request(url, { method: "GET" });
  }

  async post(route: string, body: Record<string, unknown> = {}): Promise<JsonValue> {
    return this.request(this.url(route), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async delete(route: string, body?: Record<string, unknown>): Promise<JsonValue> {
    return this.request(this.url(route), {
      method: "DELETE",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private url(route: string): URL {
    const clean = route.startsWith("/") ? route : `/${route}`;
    return new URL(`/wp-json/wpvibe/v1${clean}`, this.siteUrl);
  }

  private async request(url: URL, init: RequestInit): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.authHeader);
    headers.set("X-WPVIBE-Authorization", this.authHeader);
    headers.set("X-WPVIBE", "1");
    headers.set("Accept", "application/json");

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });

    const raw = await response.text();
    let payload: JsonValue;
    try {
      payload = raw ? JSON.parse(raw) as JsonValue : null;
    } catch {
      payload = { message: raw.slice(0, 2000) };
    }

    if (!response.ok) {
      const detail =
        payload && typeof payload === "object" && !Array.isArray(payload) && "message" in payload
          ? String(payload.message)
          : raw.slice(0, 1000);
      throw new Error(`WordPress request failed (${response.status}) ${detail}`);
    }

    return payload;
  }
}
