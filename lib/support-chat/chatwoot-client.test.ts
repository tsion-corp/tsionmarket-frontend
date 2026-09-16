import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ChatwootClient } from "./chatwoot-client";

describe("ChatwootClient", () => {
  const mockBaseUrl = "https://support.tsionark.com";
  const mockToken = "test-token";
  let client: ChatwootClient;

  beforeEach(() => {
    client = new ChatwootClient({ baseUrl: mockBaseUrl, websiteToken: mockToken });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts pubsub token and auth token from /widget response on session init", async () => {
    const mockHtml = `
      <script>
        window.chatwootPubsubToken = 'test-pubsub-token'
        window.authToken = 'test-auth-jwt'
      </script>
    `;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/widget?website_token=")) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve(mockHtml),
          });
        }
        if (url.includes("/api/v1/widget/conversations")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 101 }]),
          });
        }
        return Promise.reject(new Error("Unknown route"));
      })
    );

    const session = await client.initSession();
    expect(session).not.toBeNull();
    expect(session?.pubsubToken).toBe("test-pubsub-token");
    expect(session?.authToken).toBe("test-auth-jwt");
  });

  it("sends text message with X-Auth-Token header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 1, content: "Hello world", message_type: 0 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const session = {
      id: 101,
      pubsubToken: "test-pubsub",
      authToken: "jwt-123",
      createdAt: Date.now(),
    };

    const res = await client.sendMessage(session, "Hello world");
    expect(res).toBeDefined();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/widget/messages?website_token=test-token"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Auth-Token": "jwt-123",
        }),
        body: JSON.stringify({ message: { content: "Hello world" } }),
      })
    );
  });

  it("fetches message history with X-Auth-Token header", async () => {
    const mockMessages = [
      { id: 1, content: "Hi", message_type: 0, created_at: 1000 },
      { id: 2, content: "Hello! How can I help?", message_type: 1, created_at: 2000 },
    ];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockMessages),
    });
    vi.stubGlobal("fetch", mockFetch);

    const session = {
      id: 101,
      pubsubToken: "test-pubsub",
      authToken: "jwt-123",
      createdAt: Date.now(),
    };

    const history = await client.getMessages(session);
    expect(history).toEqual(mockMessages);
  });
});
