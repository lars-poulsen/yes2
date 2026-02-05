import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/openai";

type ChatPanelProps = {
  messages: ChatMessage[];
  showMessages: boolean;
  locked?: boolean;
  emptyMessage?: string;
};

const ChatPanel = ({
  messages,
  showMessages,
  locked = false,
  emptyMessage = "Guiden starter her, når du svarer på første spørgsmål.",
}: ChatPanelProps) => {
  const endRef = useRef<HTMLDivElement | null>(null);

  const renderWithLinks = (content: string) => {
    const parts: Array<string | { text: string; url: string }> = [];
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      if (match[1] && match[2]) {
        parts.push({ text: match[1], url: match[2] });
      } else if (match[3]) {
        parts.push({ text: match[3], url: match[3] });
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }

    return parts.map((part, index) => {
      if (typeof part === "string") {
        return <span key={index}>{part}</span>;
      }
      return (
        <a
          key={index}
          href={part.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-accent underline-offset-2"
        >
          {part.text}
        </a>
      );
    });
  };

  useEffect(() => {
    if (messages.length === 0 || !showMessages) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages, showMessages]);

  return (
    <div className="rounded-3xl border border-white/10 bg-panel p-6">
      <h3 className="text-xl font-semibold">ChatGPT-tråd</h3>
      <div className="mt-4 space-y-4 text-base">
        {locked ? (
          <p className="text-sm text-slate-400">
            Log ind for at se din historik.
          </p>
        ) : !showMessages || messages.length === 0 ? (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-4 text-base ${
                  message.role === "user"
                    ? "bg-accent text-white"
                    : "bg-white/5 text-slate-200"
                } ${message.status === "loading" ? "animate-pulse" : ""}`}
              >
                <p className="text-xs uppercase tracking-wide text-slate-300">
                  {message.role === "user"
                    ? "Dig"
                    : "ChatGPT"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">
                  {renderWithLinks(message.content)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
};

export default ChatPanel;
