export type ChatSummary = {
  id: string;
  created_at: string;
  is_free?: boolean;
  last_message?: string | null;
  last_message_at?: string | null;
  message_count?: number;
};

export type ChatMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

const withAuthHeaders = (options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return { ...options, headers, credentials: "include" as const };
};

export const createChat = async () => {
  const response = await fetch("/api/chats", withAuthHeaders({ method: "POST" }));
  if (!response.ok) {
    throw new Error("Kunne ikke oprette chat");
  }
  return (await response.json()) as {
    id: string;
    created_at: string;
    is_free?: boolean;
  };
};

export const listChats = async (limit = 20, offset = 0) => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(`/api/chats?${params.toString()}`, withAuthHeaders());
  if (!response.ok) {
    throw new Error("Kunne ikke hente chats");
  }
  return (await response.json()) as { chats: ChatSummary[]; total: number };
};

export const fetchChat = async (chatId: string, limit = 200, offset = 0) => {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  const response = await fetch(
    `/api/chats/${chatId}?${params.toString()}`,
    withAuthHeaders()
  );
  if (!response.ok) {
    throw new Error("Kunne ikke hente chatbeskeder");
  }
  return (await response.json()) as {
    chat: { id: string; created_at: string; is_free?: boolean };
    messages: ChatMessageRecord[];
    total: number;
  };
};

export const addMessage = async (
  chatId: string,
  message: { role: "user" | "assistant"; content: string }
) => {
  const response = await fetch(
    `/api/chats/${chatId}/messages`,
    withAuthHeaders({ method: "POST", body: JSON.stringify(message) })
  );
  if (!response.ok) {
    throw new Error("Kunne ikke gemme besked");
  }
  return (await response.json()) as ChatMessageRecord & { chat_id: string };
};
