export interface ChatwootSession {
  id: number;
  pubsubToken: string;
  authToken: string;
  contact?: {
    id: number;
    name?: string;
    email?: string;
  };
  createdAt: number;
}

export interface ChatwootRawMessage {
  id: number;
  content: string;
  message_type: number; // 0 = customer/incoming, 1 = agent/bot/outgoing
  created_at: number | string;
  sender?: {
    id?: number;
    name?: string;
    avatar_url?: string;
    type?: string;
  };
  attachments?: Array<{
    id: number;
    file_type: string;
    data_url?: string;
    file_url?: string;
  }>;
}

export interface ActionCableMessagePayload {
  event: string;
  data?: unknown;
}

export interface SupportChatApiResponse {
  ok: boolean;
  reply?: string;
  confidence?: number;
  needsHuman?: boolean;
  error?: string;
}
