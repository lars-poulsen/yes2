import type { ChatSummary } from "../lib/chatApi";

type ChatHistoryProps = {
  chats: ChatSummary[];
  activeChatId: string | null;
  isLoading: boolean;
  errorMessage: string;
  hasMore: boolean;
  onSelect: (chatId: string) => void;
  onLoadMore: () => void;
  onNewChat: () => void;
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const ChatHistory = ({
  chats,
  activeChatId,
  isLoading,
  errorMessage,
  hasMore,
  onSelect,
  onLoadMore,
  onNewChat,
}: ChatHistoryProps) => {
  return (
    <aside className="rounded-3xl border border-white/10 bg-panel p-5 text-sm text-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-white">Historik</h3>
        <button
          type="button"
          onClick={onNewChat}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200 hover:border-white/40"
        >
          Ny chat
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {errorMessage && (
          <p className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
            {errorMessage}
          </p>
        )}
        {isLoading && chats.length === 0 && (
          <p className="text-xs text-slate-400">Henter chats...</p>
        )}
        {!isLoading && chats.length === 0 && !errorMessage && (
          <p className="text-xs text-slate-400">Ingen chats endnu.</p>
        )}
        {chats.map((chat) => {
          const isActive = chat.id === activeChatId;
          const preview = chat.last_message?.trim() || "(Tom chat)";
          const timestamp = formatTimestamp(chat.last_message_at || chat.created_at);
          return (
            <button
              key={chat.id}
              type="button"
              onClick={() => onSelect(chat.id)}
              className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                isActive
                  ? "border-accent bg-accent/20 text-white"
                  : "border-white/10 bg-midnight/40 text-slate-200 hover:border-white/30"
              }`}
            >
              <p className="text-xs uppercase tracking-wide text-slate-400">
                {timestamp || "Ny chat"}
              </p>
              <p className="mt-1 text-sm text-slate-100">
                {preview}
              </p>
              {typeof chat.message_count === "number" && (
                <p className="mt-2 text-xs text-slate-400">
                  {chat.message_count} beskeder
                </p>
              )}
            </button>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          disabled={isLoading}
          onClick={onLoadMore}
          className="mt-4 w-full rounded-full border border-white/20 px-4 py-2 text-xs text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
        >
          {isLoading ? "Henter..." : "Indlæs flere"}
        </button>
      )}
    </aside>
  );
};

export default ChatHistory;
