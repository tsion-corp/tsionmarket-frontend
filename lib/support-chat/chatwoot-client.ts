import type { ChatwootSession, ChatwootRawMessage } from "./types";

const STORAGE_KEY = "wsws_support_chat_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ChatwootClientConfig {
  baseUrl?: string;
  websiteToken?: string;
}

export class ChatwootClient {
  private baseUrl: string;
  private websiteToken: string;

  constructor(config?: ChatwootClientConfig) {
    this.baseUrl = (
      config?.baseUrl ||
      process.env.NEXT_PUBLIC_SUPPORT_CHAT_URL ||
      "https://support.tsionark.com"
    ).replace(/\/$/, "");
    this.websiteToken =
      config?.websiteToken ||
      process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN ||
      "bZ9fdcD1qVes4Z4BfDLcpurm";
  }

  getSavedSession(): ChatwootSession | null {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed: ChatwootSession = JSON.parse(stored);
      if (Date.now() - (parsed.createdAt || 0) > SESSION_TTL_MS) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  saveSession(session: ChatwootSession): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore storage errors
    }
  }

  clearSession(): void {
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  async initSession(): Promise<ChatwootSession | null> {
    const saved = this.getSavedSession();
    if (saved) return saved;

    try {
      const widgetUrl = `${this.baseUrl}/widget?website_token=${encodeURIComponent(this.websiteToken)}`;
      const res = await fetch(widgetUrl, { method: "GET" });
      if (!res.ok) {
        throw new Error(`Failed to load widget config: ${res.statusText}`);
      }
      const html = await res.text();

      const pubsubMatch = html.match(/window\.chatwootPubsubToken\s*=\s*['"]([^'"]+)['"]/);
      const authMatch = html.match(/window\.authToken\s*=\s*['"]([^'"]+)['"]/);

      const pubsubToken = pubsubMatch ? pubsubMatch[1] : "";
      const authToken = authMatch ? authMatch[1] : "";

      if (!pubsubToken || !authToken) {
        throw new Error("Unable to parse Chatwoot widget authentication tokens");
      }

      let conversationId = 0;
      try {
        const convUrl = `${this.baseUrl}/api/v1/widget/messages?website_token=${encodeURIComponent(this.websiteToken)}`;
        const convRes = await fetch(convUrl, {
          method: "GET",
          headers: {
            "X-Auth-Token": authToken,
          },
        });
        if (convRes.ok) {
          const data = await convRes.json();
          const messages = Array.isArray(data) ? data : data?.payload || [];
          if (messages.length > 0 && messages[0].conversation_id) {
            conversationId = messages[0].conversation_id;
          }
        }
      } catch {
        // conversation may be created on first message
      }

      const session: ChatwootSession = {
        id: conversationId,
        pubsubToken,
        authToken,
        createdAt: Date.now(),
      };

      this.saveSession(session);
      return session;
    } catch (err) {
      console.error("[ChatwootClient] initSession error:", err);
      return null;
    }
  }

  async getMessages(session: ChatwootSession): Promise<ChatwootRawMessage[]> {
    try {
      const url = `${this.baseUrl}/api/v1/widget/messages?website_token=${encodeURIComponent(this.websiteToken)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          "X-Auth-Token": session.authToken,
        },
      });
      if (!res.ok) {
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data?.payload || [];
    } catch (err) {
      console.error("[ChatwootClient] getMessages error:", err);
      return [];
    }
  }

  async sendMessage(
    session: ChatwootSession,
    content: string,
    attachments?: File[]
  ): Promise<ChatwootRawMessage | null> {
    try {
      const isNewConversation = !session.id || session.id === 0;
      const endpoint = isNewConversation
        ? `${this.baseUrl}/api/v1/widget/conversations?website_token=${encodeURIComponent(this.websiteToken)}`
        : `${this.baseUrl}/api/v1/widget/messages?website_token=${encodeURIComponent(this.websiteToken)}`;

      let res: Response;

      if (attachments && attachments.length > 0) {
        const formData = new FormData();
        formData.append("message[content]", content);
        for (const file of attachments) {
          formData.append("message[attachments][]", file);
        }
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "X-Auth-Token": session.authToken,
          },
          body: formData,
        });
      } else {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Auth-Token": session.authToken,
          },
          body: JSON.stringify({
            message: {
              content,
            },
          }),
        });
      }

      if (!res.ok) {
        throw new Error(`Send message failed with status ${res.status}`);
      }

      const json = await res.json();

      if (isNewConversation && json.id) {
        session.id = json.id;
        this.saveSession(session);
        if (json.messages && json.messages.length > 0) {
          return json.messages[0];
        }
      }

      return json;
    } catch (err) {
      console.error("[ChatwootClient] sendMessage error:", err);
      return null;
    }
  }
}

export const chatwootClient = new ChatwootClient();
