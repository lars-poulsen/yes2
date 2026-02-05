import type { PromptState } from "./promptBuilder";
import { buildPrompt } from "./promptBuilder";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status?: "loading" | "done";
};

export type OpenAIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const directModeEnabled = import.meta.env.VITE_USE_DIRECT_OPENAI === "true";
const directApiKey = import.meta.env.VITE_OPENAI_API_KEY;

type StreamHandler = (delta: string) => void;

const buildOpenAIRequest = (
  messages: OpenAIMessage[],
  stream = false
): { url: string; options: RequestInit } => {
  const payload: { model?: string; messages: OpenAIMessage[]; stream?: boolean } =
    {
      messages,
      ...(stream ? { stream: true } : {}),
    };

  if (directModeEnabled) {
    payload.model = "gpt-5-mini";
  }

  if (!directModeEnabled) {
    return {
      url: "/api/openai",
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    };
  }

  if (!directApiKey) {
    throw new Error("Missing VITE_OPENAI_API_KEY");
  }

  return {
    url: "https://api.openai.com/v1/chat/completions",
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${directApiKey}`,
      },
      body: JSON.stringify(payload),
    },
  };
};

const parseStream = async (
  response: Response,
  onToken: StreamHandler
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("OpenAI stream unavailable");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const lines = chunk
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.replace(/^data:\s*/, "");
        if (data === "[DONE]") {
          return fullText;
        }
        try {
          const payload = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = payload.choices?.[0]?.delta?.content ?? "";
          if (token) {
            fullText += token;
            onToken(token);
          }
        } catch (error) {
          continue;
        }
      }
    }
  }

  return fullText;
};

const sendOpenAIRequest = async (messages: OpenAIMessage[]) => {
  const { url, options } = buildOpenAIRequest(messages);
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error("OpenAI request failed");
  }

  if (!directModeEnabled) {
    const data: { reply?: string } = await response.json();
    return data.reply?.trim() ?? "";
  }

  const data: {
    choices: Array<{ message?: { content?: string } }>;
  } = await response.json();

  return data.choices[0]?.message?.content?.trim() ?? "";
};

const sendOpenAIRequestStream = async (
  messages: OpenAIMessage[],
  onToken: StreamHandler
) => {
  const { url, options } = buildOpenAIRequest(messages, true);
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error("OpenAI request failed");
  }

  if (!directModeEnabled) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data: { reply: string } = await response.json();
      const reply = data.reply ?? "";
      if (reply) onToken(reply);
      return reply;
    }
  }

  return parseStream(response, onToken);
};

// Example OpenAI call. Wire to your backend or API route to keep keys secure.
export const buildPromptMessages = (state: PromptState): OpenAIMessage[] => {
  const prompt = buildPrompt(state);
  return [
    {
      role: "system",
      content:
        "Hvis brugeren beder om links (fx produkter), så giv et klikbart link til en relevant Google-websøgning baseret på brugerens oplysninger. Hvis brugeren beder om et direkte link eller et entydigt resultat, må du linke direkte til hjemmesiden.",
    },
    { role: "user", content: prompt },
  ];
};

export const sendPromptToOpenAI = async (state: PromptState) => {
  return sendOpenAIRequest(buildPromptMessages(state));
};

export const sendPromptToOpenAIStream = async (
  state: PromptState,
  onToken: StreamHandler
) => sendOpenAIRequestStream(buildPromptMessages(state), onToken);

export const sendTextToOpenAI = async (text: string) =>
  sendOpenAIRequest([{ role: "user", content: text }]);

export const sendMessagesToOpenAI = async (messages: OpenAIMessage[]) =>
  sendOpenAIRequest(messages);

export const sendMessagesToOpenAIStream = async (
  messages: OpenAIMessage[],
  onToken: StreamHandler
) => sendOpenAIRequestStream(messages, onToken);

export const isDirectOpenAIEnabled = () => directModeEnabled;
