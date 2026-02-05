import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import ChatHistory from "./components/ChatHistory";
import ChatPanel from "./components/ChatPanel";
import ProgressIndicator from "./components/ProgressIndicator";
import QuestionCard from "./components/QuestionCard";
import { promptQuestions } from "./data/questions";
import type { PromptQuestion } from "./data/questions";
import { buildSummaryBullets, emptyPromptState, scorePrompt } from "./lib/promptBuilder";
import {
  buildPromptMessages,
  isDirectOpenAIEnabled,
  sendMessagesToOpenAIStream,
  sendTextToOpenAI,
} from "./lib/openai";
import type { ChatMessage, OpenAIMessage } from "./lib/openai";
import { fetchCurrentUser } from "./lib/user";
import type { User } from "./lib/user";
import {
  addMessage,
  createChat,
  fetchChat,
  listChats,
} from "./lib/chatApi";
import type { ChatSummary } from "./lib/chatApi";
import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingConfig,
  fetchBillingSettings,
  updateBillingSettings,
} from "./lib/billing";
import type { BillingConfig } from "./lib/billing";
import {
  blockAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  unblockAdminUser,
  updateUserEntitlements,
} from "./lib/admin";
import type { AdminUser } from "./lib/admin";

type AuthUser = {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
};

const App = () => {
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questions, setQuestions] = useState(promptQuestions);
  const [user, setUser] = useState<User | null>(null);
  const [userStatus, setUserStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [state, setState] = useState(emptyPromptState);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGuiding, setIsGuiding] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [hasAnswer, setHasAnswer] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [hasFiveEval, setHasFiveEval] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusDetail, setStatusDetail] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatSummary[]>([]);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChatIsFree, setActiveChatIsFree] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [billingConfig, setBillingConfig] = useState<BillingConfig | null>(null);
  const [billingStatus, setBillingStatus] = useState<"idle" | "loading" | "ready">(
    "idle"
  );
  const [billingError, setBillingError] = useState("");
  const [billingActionError, setBillingActionError] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminStatus, setAdminStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [adminError, setAdminError] = useState("");
  const [adminActionUserId, setAdminActionUserId] = useState<string | null>(null);
  const [billingForm, setBillingForm] = useState({
    stripePriceId: "",
    stripePublishableKey: "",
    successUrl: "",
    cancelUrl: "",
    stripePortalReturnUrl: "",
    openaiModel: "",
    planName: "",
    planAmount: "",
    planCurrency: "",
    planInterval: "",
  });
  const chatPanelRef = useRef<HTMLDivElement | null>(null);
  const answerPanelRef = useRef<HTMLDivElement | null>(null);
  const directModeEnabled = isDirectOpenAIEnabled();

  const currentQuestion = questions[currentIndex];
  const score = scorePrompt(state);
  const canSend = score >= 3;
  const subscriptionStatus = user?.subscription_status ?? "canceled";
  const hasSubscription =
    subscriptionStatus === "active" || subscriptionStatus === "trialing";
  const isPro = subscriptionStatus === "active";
  const isPastDue = subscriptionStatus === "past_due";
  const subscriptionEndsAt = user?.current_period_end
    ? new Date(user.current_period_end)
    : null;
  const subscriptionEndsLabel = subscriptionEndsAt
    ? subscriptionEndsAt.toLocaleDateString("da-DK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;
  const freeQuestionsRemaining = user?.free_questions_remaining ?? 0;
  const freePeriodEndsAt = user?.free_period_ends_at
    ? new Date(user.free_period_ends_at)
    : null;
  const freePeriodActive =
    freePeriodEndsAt && freePeriodEndsAt.getTime() > Date.now();
  const isFreeQuestionChat =
    !hasSubscription &&
    !freePeriodActive &&
    freeQuestionsRemaining > 0 &&
    activeChatIsFree;

  const summaryBullets = useMemo(() => buildSummaryBullets(state), [state]);
  const answerSummary = useMemo(() => {
    if (!summaryBullets) return "";
    return `Opsummering af dine svar:\n${summaryBullets}\n\nSvar:\n`;
  }, [summaryBullets]);
  const mailtoUrl = useMemo(() => {
    if (!hasAnswer) return "";
    const lastAssistant = [...messages]
      .reverse()
      .find(
        (message) => message.role === "assistant" && message.status !== "loading"
      );
    const body = `${answerSummary}${lastAssistant?.content ?? ""}`.slice(0, 2000);
    return `mailto:?subject=${encodeURIComponent(
      "Dit ChatGPT-svar"
    )}&body=${encodeURIComponent(body)}`;
  }, [answerSummary, hasAnswer, messages]);

  const isBusy = isSending || isGeneratingQuestions;
  const getOpenAIErrorMessage = (error: unknown) =>
    error instanceof Error && error.message === "Missing VITE_OPENAI_API_KEY"
      ? "Manglende VITE_OPENAI_API_KEY i din .env. Tilføj nøglen for at teste direkte."
      : "Kunne ikke hente svar fra OpenAI. Sørg for at API'et er sat op.";
  const buildFollowUpContext = () => {
    const recentMessages: OpenAIMessage[] = messages
      .filter((message) => message.status !== "loading")
      .slice(-4)
      .map<OpenAIMessage>((message) => ({
        role: message.role,
        content: message.content,
      }));
    const summaryText = [
      summaryBullets ? `Opsummering af dine svar:\n${summaryBullets}` : "",
      recentMessages.length > 0
        ? `Seneste udveksling:\n${recentMessages
            .map(
              (message) =>
                `${message.role === "user" ? "Bruger" : "ChatGPT"}: ${message.content}`
            )
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 1200);
    const summaryMessage: OpenAIMessage | null = summaryText
      ? {
          role: "system",
          content: `Tidligere kontekst (kort):\n${summaryText}`,
        }
      : null;
    return {
      summaryMessage,
      recentMessages,
    };
  };

  const historyLimit = 8;

  const loadChatHistory = async (options?: { reset?: boolean }) => {
    const shouldReset = options?.reset ?? false;
    const nextOffset = shouldReset ? 0 : historyOffset;
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await listChats(historyLimit, nextOffset);
      setChatHistory((prev) =>
        shouldReset ? response.chats : [...prev, ...response.chats]
      );
      const updatedOffset = nextOffset + response.chats.length;
      setHistoryOffset(updatedOffset);
      setHistoryHasMore(updatedOffset < response.total);
    } catch (error) {
      setHistoryError("Kunne ikke hente chat-historik.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const ensureChatId = async () => {
    if (!authUser) {
      setHistoryError("Log ind for at gemme chatten.");
      return null;
    }
    if (activeChatId) return activeChatId;
    const created = await createChat();
    setActiveChatId(created.id);
    setActiveChatIsFree(Boolean(created.is_free));
    await loadChatHistory({ reset: true });
    return created.id;
  };

  const persistMessage = async (
    chatId: string,
    role: "user" | "assistant",
    content: string
  ) => {
    if (!authUser) {
      setHistoryError("Log ind for at gemme chatten.");
      return;
    }
    if (!content.trim()) return;
    try {
      await addMessage(chatId, { role, content });
    } catch (error) {
      setHistoryError("Kunne ikke gemme beskeden på serveren.");
    }
  };

  const handleSelectChat = async (chatId: string) => {
    setIsHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await fetchChat(chatId);
      setMessages(
        response.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        }))
      );
      setActiveChatId(chatId);
      setActiveChatIsFree(Boolean(response.chat.is_free));
      setStarted(true);
      setIsGuiding(false);
      setIsGeneratingQuestions(false);
      setIsSending(false);
      setHasAnswer(
        response.messages.length > 0
      );
      setFollowUp("");
    } catch (error) {
      setHistoryError("Kunne ikke hente chatten.");
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const parseJsonArray = (input: string) => {
    const trimmed = input.trim();
    const withoutFences = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/i, "");
    try {
      return JSON.parse(withoutFences);
    } catch (error) {
      const start = withoutFences.indexOf("[");
      const end = withoutFences.lastIndexOf("]");
      if (start === -1 || end === -1 || end <= start) {
        throw error;
      }
      const slice = withoutFences.slice(start, end + 1);
      return JSON.parse(slice);
    }
  };

  const proQuestionIds = [
    "proQuestion1",
    "proQuestion2",
    "proQuestion3",
    "proQuestion4",
    "proQuestion5",
    "proQuestion6",
    "proQuestion7",
  ] as const;

  const mapProQuestions = (
    parsed: Array<{ label?: string; helper?: string; placeholder?: string }>,
    maxCount: number,
    idOffset = 0
  ): PromptQuestion[] =>
    parsed.slice(0, maxCount).map((item, index) => ({
      id: proQuestionIds[idOffset + index],
      label: item.label?.trim() || `Opfølgende spørgsmål ${idOffset + index + 1}`,
      helper: item.helper?.trim() || "",
      placeholder: item.placeholder?.trim() || "Skriv dit svar...",
    }));

  const countAnswered = (nextState = state) => scorePrompt(nextState);

  const generateProQuestions = async (
    promptState: typeof state
  ): Promise<PromptQuestion[]> => {
    const firstAnswer = promptQuestions.slice(0, 1);
    const answers = firstAnswer
      .map(
        (question) => `- ${question.label}: ${promptState[question.id] || "-"}`
      )
      .join("\n");
    const prompt = `Du er en hjælpsom assistent. Her er brugerens første svar:\n${answers}\n\nVurder hvilke oplysninger der mangler for at nå score 10 i prompt-kvalitet. Formulér 0 til 4 konkrete opfølgende spørgsmål på dansk, som bygger videre på svaret. Returner KUN JSON som en array af objekter med felterne "label", "helper" og "placeholder".`;
    const reply = await sendTextToOpenAI(prompt);

    try {
      const parsed = parseJsonArray(reply) as Array<{
        label?: string;
        helper?: string;
        placeholder?: string;
      }>;
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid response");
      }
      return mapProQuestions(parsed, 4);
    } catch (error) {
      return [
        {
          id: "proQuestion1" as const,
          label: "Hvad er det vigtigste, du vil have svar på nu?",
          helper: "Vælg det vigtigste fokuspunkt baseret på dine svar.",
          placeholder: "Skriv dit svar...",
        },
        {
          id: "proQuestion2" as const,
          label: "Hvilke detaljer mangler vi for at give dig et præcist svar?",
          helper: "Nævn de oplysninger, der stadig mangler.",
          placeholder: "Skriv dit svar...",
        },
        {
          id: "proQuestion3" as const,
          label: "Hvad har du allerede prøvet, som vi skal tage højde for?",
          helper: "Fortæl kort om tidligere forsøg.",
          placeholder: "Skriv dit svar...",
        },
        {
          id: "proQuestion4" as const,
          label: "Er der en tidsramme eller deadline, vi skal kende?",
          helper: "Fx i morgen, denne uge, næste måned.",
          placeholder: "Skriv dit svar...",
        },
      ];
    }
  };

  const evaluatePromptAfterFive = async () => {
    const firstFive = questions.slice(0, 5);
    const answers = firstFive
      .map((question) => `- ${question.label}: ${state[question.id] || "-"}`)
      .join("\n");
    const prompt = `Du er en hjælpsom assistent. Her er brugerens første 5 svar:\n${answers}\n\nVurder promptens kvalitet fra 1-10. Hvis scoren er 7 eller højere, så giv et endeligt svar på dansk. Hvis scoren er under 7, så formulér PRÆCIS 5 nye spørgsmål på dansk for at forbedre prompten. Returner KUN enten selve svaret eller en JSON array af 5 objekter med felterne "label", "helper" og "placeholder".`;
    const reply = await sendTextToOpenAI(prompt);

    try {
      const parsed = parseJsonArray(reply) as Array<{
        label?: string;
        helper?: string;
        placeholder?: string;
      }>;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Invalid response");
      }
      return {
        followUps: mapProQuestions(parsed, 5),
        answer: "",
      };
    } catch (error) {
      return { followUps: null, answer: reply.trim() };
    }
  };

  const handleNext = async (
    options?: { skipCapture?: boolean; nextState?: typeof state }
  ) => {
    const nextState = options?.nextState ?? state;
    if (!options?.skipCapture) {
      const userAnswer = nextState[currentQuestion.id].trim();
      if (userAnswer.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "user",
            content: userAnswer,
          },
        ]);
      }
    }

    const answeredCount = countAnswered(nextState);
    const isAtFirst = currentIndex === 0;
    if (isPro && isAtFirst && questions.length === promptQuestions.length) {
      let shouldAutoSend = false;
      setIsGeneratingQuestions(true);
      const pendingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          role: "assistant",
          content:
            "Systemet arbejder på at vurdere dine svar og formulere næste spørgsmål. Vent venligst et øjeblik...",
          status: "loading",
        },
      ]);
      try {
        const generated = await generateProQuestions(nextState);
        const updatedQuestions = [
          ...promptQuestions.slice(0, 1),
          ...generated,
        ];
        setQuestions(updatedQuestions);
        if (generated.length === 0) {
          setIsGuiding(false);
          setMessages((prev) =>
            prev.map((message) =>
              message.id === pendingId
                ? {
                    ...message,
                    content:
                      "Tak! Dine svar er allerede dækkende. Du kan nu sende dit spørgsmål til ChatGPT.",
                    status: "done" as const,
                  }
                : message
            )
          );
          shouldAutoSend = true;
          return;
        }
        setCurrentIndex(1);
        const nextQuestion = updatedQuestions[1];
        setMessages((prev) =>
          prev
            .map((message) =>
              message.id === pendingId
                ? {
                    ...message,
                    content: "Her er næste spørgsmål:",
                    status: "done" as const,
                  }
                : message
            )
            .concat([
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content: nextQuestion.label,
              },
            ])
        );
      } catch (error) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  content:
                    "Kunne ikke generere de næste spørgsmål. Vi fortsætter med standardspørgsmålene.",
                  status: "done",
                }
              : message
          )
        );
        setCurrentIndex((prev) => prev + 1);
        const nextQuestion = questions[currentIndex + 1];
        if (nextQuestion) {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: nextQuestion.label,
            },
          ]);
        }
      } finally {
        setIsGeneratingQuestions(false);
        if (shouldAutoSend) {
          await handleSend();
        }
      }
      return;
    }

    if (isPro && answeredCount === 5 && !hasFiveEval) {
      setHasFiveEval(true);
      setIsGeneratingQuestions(true);
      const pendingId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        {
          id: pendingId,
          role: "assistant",
          content:
            "Jeg vurderer dine svar og ser, om vi kan give dig et svar med det samme...",
          status: "loading",
        },
      ]);
      try {
        const evaluation = await evaluatePromptAfterFive();
        if (evaluation.followUps) {
          const updatedQuestions = [
            ...questions.slice(0, 5),
            ...evaluation.followUps,
          ];
          setQuestions(updatedQuestions);
          setCurrentIndex(5);
          const nextQuestion = updatedQuestions[5];
          setMessages((prev) =>
            prev
              .map((message) =>
                message.id === pendingId
                  ? {
                      ...message,
                      content: "Her er næste spørgsmål:",
                      status: "done" as const,
                    }
                  : message
              )
              .concat([
                {
                  id: crypto.randomUUID(),
                  role: "assistant",
                  content: nextQuestion.label,
                },
              ])
          );
        } else {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === pendingId
                ? {
                    ...message,
                    content: `${answerSummary}${evaluation.answer || "Her er dit svar."}`,
                    status: "done" as const,
                  }
                : message
            )
          );
          setHasAnswer(true);
          setIsGuiding(false);
        }
      } catch (error) {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  content:
                    "Kunne ikke evaluere prompten. Vi fortsætter med flere spørgsmål.",
                  status: "done" as const,
                }
              : message
          )
        );
      } finally {
        setIsGeneratingQuestions(false);
      }
      return;
    }

    if (isPro && answeredCount >= 10) {
      setIsGuiding(false);
      await handleSend();
      return;
    }

    if (currentIndex < questions.length - 1) {
      setCurrentIndex((prev) => prev + 1);
      const nextQuestion = questions[currentIndex + 1];
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: nextQuestion.label,
        },
      ]);
    } else {
      setIsGuiding(false);
      await handleSend();
    }
  };

  const handleSkip = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: "Sprang over.",
      },
    ]);
    const updatedState = {
      ...state,
      [currentQuestion.id]: "",
    };
    setState(updatedState);
    handleNext({ skipCapture: true, nextState: updatedState });
  };

  const handleStop = () => {
    setIsGuiding(false);
  };

  const handleChange = (value: string) => {
    setState((prev) => ({
      ...prev,
      [currentQuestion.id]: value,
    }));
  };

  const streamAssistantMessage = async (options: {
    messagesToSend: OpenAIMessage[];
    baseContent?: string;
    onComplete?: (fullReply: string, reply: string) => Promise<void>;
  }) => {
    const { messagesToSend, baseContent = "", onComplete } = options;
    setIsSending(true);
    const pendingId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: "assistant",
        content: baseContent,
        status: "loading",
      },
    ]);

    try {
      const reply = await sendMessagesToOpenAIStream(messagesToSend, (delta) => {
        if (!delta) return;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === pendingId
              ? {
                  ...message,
                  content: `${message.content}${delta}`,
                }
              : message
          )
        );
      });
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                status: "done" as const,
              }
            : message
        )
      );
      if (onComplete) {
        await onComplete(`${baseContent}${reply || ""}`, reply || "");
      }
      return { ok: true, reply };
    } catch (error) {
      const errorMessage = getOpenAIErrorMessage(error);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingId
            ? {
                ...message,
                content: errorMessage,
                status: "done" as const,
              }
            : message
        )
      );
      return { ok: false, reply: "" };
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    if (!authUser) {
      setHistoryError("Log ind for at sende til ChatGPT.");
      return;
    }
    const promptMessages = buildPromptMessages(state);
    const userPrompt =
      promptMessages.find((message) => message.role === "user")?.content ?? "";
    let chatId: string | null = null;
    try {
      chatId = await ensureChatId();
      if (chatId) {
        await persistMessage(chatId, "user", userPrompt);
      }
    } catch (error) {
      setHistoryError("Kunne ikke starte en ny chat på serveren.");
    }
    const baseContent = answerSummary ? `${answerSummary}` : "";
    const result = await streamAssistantMessage({
      messagesToSend: promptMessages,
      baseContent,
      onComplete: async (fullReply) => {
        if (chatId) {
          await persistMessage(chatId, "assistant", fullReply);
          await loadChatHistory({ reset: true });
        }
      },
    });
    if (result.ok) {
      setHasAnswer(true);
    }
    setIsGuiding(false);
  };

  const handleFollowUpSend = async () => {
    const trimmed = followUp.trim();
    if (!trimmed) return;
    if (!authUser) {
      setHistoryError("Log ind for at sende et opfølgende spørgsmål.");
      return;
    }
    const { summaryMessage, recentMessages } = buildFollowUpContext();
    const contextualMessages: OpenAIMessage[] = [
      {
        role: "system",
        content:
          "Dette er et opfølgende spørgsmål i samme chat. Brug tidligere svar som kontekst, og svar altid på brugerens sprog. Hvis brugeren beder om links (fx produkter), så giv et klikbart link til en relevant Google-websøgning baseret på brugerens oplysninger. Hvis brugeren beder om et direkte link eller et entydigt resultat, må du linke direkte til hjemmesiden.",
      },
      ...(summaryMessage ? [summaryMessage] : []),
      ...recentMessages,
      { role: "user" as const, content: trimmed },
    ];
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
      },
    ]);
    let chatId: string | null = null;
    try {
      chatId = await ensureChatId();
      if (chatId) {
        await persistMessage(chatId, "user", trimmed);
      }
    } catch (error) {
      setHistoryError("Kunne ikke starte en ny chat på serveren.");
    }

    const result = await streamAssistantMessage({
      messagesToSend: contextualMessages,
      onComplete: async (fullReply) => {
        if (chatId) {
          await persistMessage(chatId, "assistant", fullReply);
          await loadChatHistory({ reset: true });
        }
      },
    });
    if (result.ok) {
      setFollowUp("");
    }
  };

  const resetGuide = () => {
    setCurrentIndex(0);
    setState(emptyPromptState);
    setQuestions(promptQuestions);
    setMessages([]);
    setIsGuiding(true);
    setIsGeneratingQuestions(false);
    setHasAnswer(false);
    setFollowUp("");
    setHasFiveEval(false);
    setActiveChatId(null);
    setActiveChatIsFree(false);
  };

  const canViewHistory = Boolean(authUser);
  const isAdmin = authUser?.role === "admin";

  const planLabel = useMemo(() => {
    if (!billingConfig?.plan) return null;
    const { amount, currency, interval, name } = billingConfig.plan;
    if (!amount || !currency || !interval) return name ?? null;
    const formatted = new Intl.NumberFormat("da-DK", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount / 100);
    const intervalLabel = interval === "month" ? "md." : interval;
    return `${formatted} / ${intervalLabel}`;
  }, [billingConfig]);

  const formatDateInputValue = (value: string | null) =>
    value ? new Date(value).toISOString().slice(0, 10) : "";

  const handleAdminUserFieldChange = (
    userId: string,
    field: "free_questions_remaining" | "free_period_ends_at",
    value: number | string | null
  ) => {
    setAdminUsers((prev) =>
      prev.map((user) =>
        user.id === userId ? { ...user, [field]: value } : user
      )
    );
  };

  const handleAuthSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authEmail || !authPassword) {
      setAuthError("Udfyld både email og adgangskode.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setAuthError(
          data?.error ||
            data?.message ||
            (authMode === "signup"
              ? "Kunne ikke oprette brugeren."
              : "Forkert email eller adgangskode. Vil du oprette en bruger?")
        );
        return;
      }
      setAuthUser(data);
      setShowAuthForm(false);
      setAuthPassword("");
    } catch (error) {
      setAuthError("Netværksfejl. Prøv igen.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setAuthUser(null);
      setShowAuthForm(false);
      setAuthLoading(false);
    }
  };

  const handleAuthOpen = (mode: "login" | "signup") => {
    setAuthMode(mode);
    setShowAuthForm(true);
    window.requestAnimationFrame(() => {
      document.getElementById("konto")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  useEffect(() => {
    let isMounted = true;
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (isMounted) {
          setAuthUser(data);
        }
      } catch (error) {
        // ignore
      } finally {
        if (isMounted) {
          setAuthChecked(true);
        }
      }
    };
    checkAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authUser) {
      setBillingConfig(null);
      setBillingStatus("idle");
      setBillingError("");
      return;
    }

    const loadBillingConfig = async () => {
      setBillingStatus("loading");
      setBillingError("");
      try {
        const config = await fetchBillingConfig();
        setBillingConfig(config);
        setBillingStatus("ready");
      } catch (error) {
        setBillingError("Kunne ikke hente betalingsdetaljer.");
        setBillingStatus("ready");
      }
    };

    loadBillingConfig();
  }, [authUser]);

  useEffect(() => {
    if (!isAdmin) {
      setAdminUsers([]);
      setAdminStatus("idle");
      setAdminError("");
      return;
    }

    const loadAdminData = async () => {
      setAdminStatus("loading");
      setAdminError("");
      try {
        const [users, settings] = await Promise.all([
          fetchAdminUsers(),
          fetchBillingSettings(),
        ]);
        setAdminUsers(users);
        setBillingForm({
          stripePriceId: settings.stripePriceId ?? "",
          stripePublishableKey: settings.stripePublishableKey ?? "",
          successUrl: settings.successUrl ?? "",
          cancelUrl: settings.cancelUrl ?? "",
          stripePortalReturnUrl: settings.stripePortalReturnUrl ?? "",
          openaiModel: settings.openaiModel ?? "",
          planName: settings.plan.name ?? "",
          planAmount: settings.plan.amount ? String(settings.plan.amount) : "",
          planCurrency: settings.plan.currency ?? "",
          planInterval: settings.plan.interval ?? "",
        });
        setAdminStatus("ready");
      } catch (error) {
        setAdminError("Kunne ikke hente admin-data.");
        setAdminStatus("error");
      }
    };

    loadAdminData();
  }, [isAdmin]);

  const handleStartSubscription = async () => {
    setBillingActionError("");
    try {
      const session = await createCheckoutSession();
      window.location.assign(session.url);
    } catch (error) {
      setBillingActionError("Kunne ikke starte checkout. Prøv igen.");
    }
  };

  const handleManageSubscription = async () => {
    setBillingActionError("");
    try {
      const session = await createPortalSession();
      window.location.assign(session.url);
    } catch (error) {
      setBillingActionError("Kunne ikke åbne abonnementsportalen.");
    }
  };

  const handleBillingFormChange = (
    field: keyof typeof billingForm,
    value: string
  ) => {
    setBillingForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleBillingSettingsSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAdminError("");
    try {
      await updateBillingSettings({
        stripePriceId: billingForm.stripePriceId || null,
        stripePublishableKey: billingForm.stripePublishableKey || null,
        successUrl: billingForm.successUrl || null,
        cancelUrl: billingForm.cancelUrl || null,
        stripePortalReturnUrl: billingForm.stripePortalReturnUrl || null,
        openaiModel: billingForm.openaiModel || null,
        planName: billingForm.planName || null,
        planAmount: billingForm.planAmount
          ? Number(billingForm.planAmount)
          : null,
        planCurrency: billingForm.planCurrency || null,
        planInterval: billingForm.planInterval || null,
      });
      const settings = await fetchBillingSettings();
      setBillingForm({
        stripePriceId: settings.stripePriceId ?? "",
        stripePublishableKey: settings.stripePublishableKey ?? "",
        successUrl: settings.successUrl ?? "",
        cancelUrl: settings.cancelUrl ?? "",
        stripePortalReturnUrl: settings.stripePortalReturnUrl ?? "",
        openaiModel: settings.openaiModel ?? "",
        planName: settings.plan.name ?? "",
        planAmount: settings.plan.amount ? String(settings.plan.amount) : "",
        planCurrency: settings.plan.currency ?? "",
        planInterval: settings.plan.interval ?? "",
      });
    } catch (error) {
      setAdminError("Kunne ikke gemme Stripe-indstillinger.");
    }
  };

  const handleEntitlementSave = async (
    userId: string,
    freeQuestionsRemaining: number,
    freePeriodEndsAt: string | null
  ) => {
    setAdminError("");
    try {
      await updateUserEntitlements(userId, {
        freeQuestionsRemaining,
        freePeriodEndsAt,
      });
      const users = await fetchAdminUsers();
      setAdminUsers(users);
    } catch (error) {
      setAdminError("Kunne ikke opdatere bruger.");
    }
  };

  const refreshAdminUsers = async () => {
    const users = await fetchAdminUsers();
    setAdminUsers(users);
  };

  const handleBlockToggle = async (adminUser: AdminUser) => {
    const isBlocked = Boolean(adminUser.blocked_at);
    const actionLabel = isBlocked ? "afblokere" : "blokere";
    const confirmed = window.confirm(
      `Er du sikker på, at du vil ${actionLabel} ${adminUser.email}?`
    );
    if (!confirmed) {
      return;
    }
    setAdminError("");
    setAdminActionUserId(adminUser.id);
    try {
      if (isBlocked) {
        await unblockAdminUser(adminUser.id);
      } else {
        await blockAdminUser(adminUser.id);
      }
      await refreshAdminUsers();
    } catch (error) {
      setAdminError(
        isBlocked
          ? "Kunne ikke afblokere brugeren."
          : "Kunne ikke blokere brugeren."
      );
    } finally {
      setAdminActionUserId(null);
    }
  };

  const handleDeleteUser = async (adminUser: AdminUser) => {
    const confirmed = window.confirm(
      `Slet ${adminUser.email}? Dette kan ikke fortrydes.`
    );
    if (!confirmed) {
      return;
    }
    setAdminError("");
    setAdminActionUserId(adminUser.id);
    try {
      await deleteAdminUser(adminUser.id);
      await refreshAdminUsers();
    } catch (error) {
      setAdminError("Kunne ikke slette brugeren.");
    } finally {
      setAdminActionUserId(null);
    }
  };

  useEffect(() => {
    if (!started) return;
    answerPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [started]);

  useEffect(() => {
    let cancelled = false;
    const loadUser = async () => {
      if (!authUser) {
        setUser(null);
        setUserStatus("ready");
        return;
      }
      try {
        setUserStatus("loading");
        const currentUser = await fetchCurrentUser();
        if (!cancelled) {
          setUser(currentUser);
          setUserStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          setUser(null);
          setUserStatus("error");
        }
      }
    };
    loadUser();
    if (authUser) {
      loadChatHistory({ reset: true });
    }
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  useEffect(() => {
    if (!hasAnswer) return;
    chatPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hasAnswer]);

  useEffect(() => {
    if (!isSending && !isGeneratingQuestions) {
      setStatusMessage("");
      setStatusDetail("");
      return;
    }

    const message = isGeneratingQuestions
      ? "Henter næste spørgsmål – det tager normalt 2–6 sekunder."
      : "Henter svar – det tager normalt 2–6 sekunder.";

    setStatusMessage(message);
    setStatusDetail("");

    const timeoutId = window.setTimeout(() => {
      setStatusDetail(
        "Gode svar tager lidt ekstra tid – tak for din tålmodighed."
      );
    }, 10000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isSending, isGeneratingQuestions]);

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              NemtSvar.dk
            </p>
            <p className="text-lg font-semibold text-slate-100">
              Tryg, enkel hjælp til dit næste spørgsmål
            </p>
          </div>
          {authUser ? (
            <div className="flex flex-wrap items-center gap-3 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    userStatus === "loading"
                      ? "bg-slate-400"
                      : isPro
                        ? "bg-emerald-400"
                        : isPastDue
                          ? "bg-amber-400"
                          : "bg-rose-400"
                  }`}
                />
                <div className="flex flex-col text-left">
                  <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    Abonnement
                  </span>
                  <span className="text-sm font-semibold text-white">
                    {userStatus === "loading"
                      ? "Henter status..."
                      : isPro
                        ? "Pro aktiv"
                        : isPastDue
                          ? "Betaling fejlede"
                          : "Ingen aktiv betaling"}
                  </span>
                </div>
                {subscriptionEndsLabel && (
                  <span className="ml-2 rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                    Fornyes {subscriptionEndsLabel}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleAuthOpen("login")}
                className="rounded-full border border-white/20 px-4 py-2 text-slate-200 hover:border-white/40"
              >
                Log ind
              </button>
              <button
                type="button"
                onClick={() => handleAuthOpen("signup")}
                className="rounded-full bg-white/10 px-4 py-2 text-white hover:bg-white/20"
              >
                Opret bruger
              </button>
            </div>
          )}
        </header>

        {!started && (
          <div className="space-y-12">
            <section className="grid gap-10 rounded-[32px] border border-white/10 bg-white/5 p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:p-12">
              <div className="space-y-6 text-left">
                <div className="space-y-4">
                  <h1 className="text-3xl font-semibold leading-tight text-white sm:text-4xl">
                    Få et klart svar – på 1 minut
                  </h1>
                  <p className="text-base text-slate-300 sm:text-lg">
                    Du svarer på få korte spørgsmål. Vi hjælper dig med at
                    formulere det rigtigt – helt uden teknik.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {authUser && (
                    <button
                      type="button"
                      onClick={() => {
                        setStarted(true);
                        resetGuide();
                      }}
                      className="w-full rounded-full bg-accent px-8 py-4 text-base font-semibold text-white shadow-lg shadow-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-auto"
                    >
                      Start guiden
                    </button>
                  )}
                  <a
                    href="#eksempel"
                    className="flex w-full items-center justify-center rounded-full border border-white/20 px-6 py-4 text-base font-semibold text-white/90 hover:border-white/40 sm:w-auto"
                  >
                    Se et eksempel
                  </a>
                </div>
                {authUser ? (
                  <p className="text-sm text-slate-400">
                    Typisk 1 minut • 5–8 spørgsmål
                  </p>
                ) : (
                  <p className="text-sm text-slate-300">
                    Guidet chat kræver en konto. Log ind eller opret en bruger
                    for at starte guiden og gemme dine svar.
                  </p>
                )}
                <p className="text-sm text-slate-300">
                  Designet til almindeligt dansk – især hvis IT ikke er din
                  stærke side.
                </p>
                <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-200">
                  <span className="rounded-full border border-white/15 bg-white/5 px-4 py-2">
                    Ingen teknisk viden
                  </span>
                  <button
                    type="button"
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2"
                  >
                    Dansk og enkelt
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAbout(true)}
                    className="rounded-full border border-white/15 bg-white/5 px-4 py-2"
                  >
                    Om NemtSvar.dk
                  </button>
                </div>
              </div>
              <div className="order-first lg:order-none">
                <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-transparent p-6 shadow-lg shadow-slate-900/40">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900/60">
                    <img
                      src="https://nemtsvar.dk/assets/Kvinde_med_mobiltelefon_bruger_nemtsvar_dk.png"
                      alt="Kvinde der bruger telefon til at få hjælp på NemtSvar.dk"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="text-left">
                <h2 className="text-2xl font-semibold text-white">
                  Sådan virker det
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  Tre enkle trin – ingen teknik, ingen stress.
                </p>
              </div>
              <div className="grid gap-6 md:grid-cols-3">
                {[
                  {
                    title: "Vælg hvad du vil have hjælp til",
                    description:
                      "Du vælger emnet, så vi kan målrette hjælpen.",
                    icon: (
                      <svg viewBox="0 0 48 48" className="h-10 w-10">
                        <rect x="8" y="10" width="32" height="24" rx="6" fill="#E2E8F0" />
                        <rect x="14" y="16" width="20" height="4" rx="2" fill="#94A3B8" />
                        <rect x="14" y="24" width="14" height="4" rx="2" fill="#94A3B8" />
                      </svg>
                    ),
                  },
                  {
                    title: "Svar på få enkle spørgsmål",
                    description:
                      "Vi guider dig trin for trin på almindeligt dansk.",
                    icon: (
                      <svg viewBox="0 0 48 48" className="h-10 w-10">
                        <circle cx="16" cy="16" r="6" fill="#E2E8F0" />
                        <rect x="26" y="12" width="14" height="4" rx="2" fill="#94A3B8" />
                        <rect x="8" y="26" width="32" height="12" rx="6" fill="#CBD5F5" />
                      </svg>
                    ),
                  },
                  {
                    title: "Få et klart spørgsmål + et brugbart svar",
                    description:
                      "Du står tilbage med et tydeligt resultat, klar til brug.",
                    icon: (
                      <svg viewBox="0 0 48 48" className="h-10 w-10">
                        <rect x="10" y="10" width="28" height="28" rx="10" fill="#E2E8F0" />
                        <path
                          d="M17 24l5 5 10-10"
                          stroke="#64748B"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                    ),
                  },
                ].map((step, index) => (
                  <div
                    key={step.title}
                    className="rounded-3xl border border-white/10 bg-white/5 p-6 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                        {step.icon}
                      </div>
                      <span className="text-sm font-semibold text-slate-300">
                        Trin {index + 1}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-white">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-300">
                      {step.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section
              id="eksempel"
              className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left lg:p-10"
            >
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold text-white">Eksempel</h2>
                <p className="text-sm text-slate-400">
                  Se forskellen på før og efter – det gør det meget nemmere at
                  få hjælp.
                </p>
              </div>
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Før
                  </p>
                  <p className="mt-3 text-base text-slate-200">
                    “Jeg vil gerne spise sundere. Hvad skal jeg gøre?”
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                  <p className="text-xs uppercase tracking-wide text-slate-400">
                    Efter
                  </p>
                  <p className="mt-3 text-base text-slate-200">
                    “Jeg er 52 år, vil tabe 5 kg og har travlt i hverdagen. Kan
                    du lave en enkel ugeplan med 3 hurtige aftensmåltider og
                    indkøbsliste?”
                  </p>
                </div>
              </div>
              <p className="mt-6 text-sm font-semibold text-slate-200">
                Det er den slags forbedring NemtSvar laver for dig.
              </p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left lg:p-10">
              <h2 className="text-2xl font-semibold text-white">
                Trygt at bruge
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                  <span>Du bestemmer selv, hvad du skriver.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2 w-2 rounded-full bg-emerald-300" />
                  <span>
                    Vi gemmer kun det nødvendige for at du kan fortsætte.
                  </span>
                </li>
              </ul>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left lg:p-10">
              <h2 className="text-2xl font-semibold text-white">FAQ</h2>
              <div className="mt-6 space-y-4">
                <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-white">
                    Skal jeg kunne noget teknisk?
                  </summary>
                  <p className="mt-2 text-sm text-slate-300">
                    Nej. Du bliver guidet trin for trin og svarer blot på få,
                    enkle spørgsmål i almindeligt dansk. Du behøver ikke kende
                    til teknik, programmer eller kunstig intelligens.
                  </p>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-white">
                    Koster det noget at bruge Nemt Svar?
                  </summary>
                  <div className="mt-2 space-y-3 text-sm text-slate-300">
                    <p>
                      Ja, det koster et mindre månedligt gebyr at benytte
                      NemtSvar.dk, fordi vi bruger tid og teknologi på at give
                      dig et gennemarbejdet og brugbart svar.
                    </p>
                    <p>
                      Du betaler for kvalitet, ro og klare resultater – ikke
                      for teknik.
                    </p>
                    <p>Der er ingen binding, og du kan altid stoppe igen.</p>
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-white">
                    Hvad kan jeg bruge det til?
                  </summary>
                  <div className="mt-2 space-y-3 text-sm text-slate-300">
                    <p>Nemt Svar kan bruges til mange hverdagssituationer, fx:</p>
                    <ul className="list-disc space-y-1 pl-5">
                      <li>planlægning af ferie eller rejse</li>
                      <li>madplaner og hverdagsidéer</li>
                      <li>breve, mails og beskeder</li>
                      <li>overblik før et køb eller en beslutning</li>
                    </ul>
                    <p>
                      Kort sagt: Når du vil have et bedre formuleret spørgsmål
                      – og et mere brugbart svar.
                    </p>
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-white">
                    Bruger I kunstig intelligens?
                  </summary>
                  <div className="mt-2 space-y-3 text-sm text-slate-300">
                    <p>
                      Ja. Vi bruger kunstig intelligens i baggrunden til at
                      formulere et klart spørgsmål og et brugbart svar – på en
                      rolig og forståelig måde.
                    </p>
                    <p>
                      Du behøver ikke vide noget om teknologien for at bruge
                      Nemt Svar.
                    </p>
                  </div>
                </details>
                <details className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <summary className="cursor-pointer text-base font-semibold text-white">
                    Er Nemt Svar noget for mig?
                  </summary>
                  <p className="mt-2 text-sm text-slate-300">
                    Ja, hvis du gerne vil have hjælp til at formulere dig bedre
                    – uden at skulle sætte dig ind i teknik eller bruge tid på
                    at finde de rigtige ord selv.
                  </p>
                </details>
              </div>
            </section>

            <section
              id="konto"
              className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left lg:p-10"
            >
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-white">
                  Gem dine svar og kom tilbage
                </h2>
                <p className="text-sm text-slate-400">
                  Opret bruger eller log ind hvis du vil gemme historik og
                  fortsætte senere.
                </p>
              </div>
              <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
                {!authChecked ? (
                  <p className="text-sm text-slate-300">
                    Tjekker login-status...
                  </p>
                ) : authUser ? (
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Logget ind
                      </p>
                      <p className="text-lg font-semibold">{authUser.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      disabled={authLoading}
                      className="rounded-full border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                    >
                      Log ud
                    </button>
                  </div>
                ) : showAuthForm ? (
                  <form onSubmit={handleAuthSubmit} className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm text-slate-300">
                        Email
                        <input
                          type="email"
                          required
                          value={authEmail}
                          onChange={(event) => setAuthEmail(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                          placeholder="dig@firma.dk"
                        />
                      </label>
                      <label className="text-sm text-slate-300">
                        Adgangskode
                        <input
                          type="password"
                          required
                          value={authPassword}
                          onChange={(event) => setAuthPassword(event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                          placeholder="Mindst 8 tegn"
                        />
                      </label>
                    </div>
                    {authError && (
                      <p className="text-sm text-rose-300">{authError}</p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        disabled={authLoading}
                        className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
                      >
                        {authMode === "signup"
                          ? authLoading
                            ? "Opretter..."
                            : "Opret bruger"
                          : authLoading
                            ? "Logger ind..."
                            : "Log ind"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthOpen("login")}
                        className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                      >
                        Log ind
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthOpen("signup")}
                        className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                      >
                        Opret bruger
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      Log ind for at se chat-historikken. Forkert login eller en
                      eksisterende bruger bliver vist her som fejl.
                    </p>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleAuthOpen("login")}
                      className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                    >
                      Log ind
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAuthOpen("signup")}
                      className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20"
                    >
                      Opret bruger
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {started && (showAuthForm || authUser) && (
          <section
            id="konto"
            className="rounded-3xl border border-white/10 bg-white/5 p-6"
          >
            <h2 className="text-lg font-semibold text-white">
              Log ind for at gemme historik
            </h2>
            <div className="mt-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
              {!authChecked ? (
                <p className="text-sm text-slate-300">
                  Tjekker login-status...
                </p>
              ) : authUser ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">
                      Logget ind
                    </p>
                    <p className="text-lg font-semibold">{authUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={authLoading}
                    className="rounded-full border border-white/20 px-6 py-3 text-sm text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                  >
                    Log ud
                  </button>
                </div>
              ) : showAuthForm ? (
                <form onSubmit={handleAuthSubmit} className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Email
                      <input
                        type="email"
                        required
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="dig@firma.dk"
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      Adgangskode
                      <input
                        type="password"
                        required
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="Mindst 8 tegn"
                      />
                    </label>
                  </div>
                  {authError && (
                    <p className="text-sm text-rose-300">{authError}</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
                    >
                      {authMode === "signup"
                        ? authLoading
                          ? "Opretter..."
                          : "Opret bruger"
                        : authLoading
                          ? "Logger ind..."
                          : "Log ind"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAuthOpen("login")}
                      className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                    >
                      Log ind
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAuthOpen("signup")}
                      className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                    >
                      Opret bruger
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Log ind for at se chat-historikken. Forkert login eller en
                    eksisterende bruger bliver vist her som fejl.
                  </p>
                </form>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAuthOpen("login")}
                    className="rounded-full border border-white/20 px-5 py-3 text-sm font-semibold text-slate-200 hover:border-white/40"
                  >
                    Log ind
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAuthOpen("signup")}
                    className="rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20"
                  >
                    Opret bruger
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {started && (
          <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
            <ChatHistory
              chats={chatHistory}
              activeChatId={activeChatId}
              isLoading={isHistoryLoading}
              errorMessage={historyError}
              hasMore={historyHasMore}
              onSelect={handleSelectChat}
              onLoadMore={() => loadChatHistory()}
              onNewChat={resetGuide}
            />
            <div className="flex flex-col gap-8">
              {directModeEnabled && (
                <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs text-amber-100">
                  Du bruger direkte OpenAI-kald fra browseren. Det er kun til test
                  og er ikke sikkert til produktion. Husk at skifte til en
                  backend, når løsningen skal udgives til brugere.
                </div>
              )}
              {!isPro && userStatus === "ready" && (
                <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                  <p className="font-semibold">
                    Pro-funktioner er låst, fordi der ikke er en aktiv betaling.
                  </p>
                  <p className="mt-2 text-rose-100/80">
                    {isPastDue
                      ? "Vi kunne ikke gennemføre den seneste betaling. Opdater dit kort for at genaktivere Pro."
                      : "Opgrader dit abonnement for at låse op for opfølgende spørgsmål, automatisk evaluering og hurtigere hjælp."}
                  </p>
                </div>
              )}
              {authUser && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">
                        Abonnement
                      </p>
                      <p className="text-lg font-semibold text-white">
                        {isPro
                          ? "Pro aktiv"
                          : isPastDue
                            ? "Betaling fejlede"
                            : "Ingen aktiv betaling"}
                      </p>
                      {planLabel && (
                        <p className="mt-1 text-sm text-slate-300">
                          Plan: {planLabel}
                        </p>
                      )}
                      {billingStatus === "loading" && (
                        <p className="mt-2 text-xs text-slate-400">
                          Henter betalingsdetaljer...
                        </p>
                      )}
                      {billingError && (
                        <p className="mt-2 text-xs text-rose-300">{billingError}</p>
                      )}
                      {freePeriodActive && freePeriodEndsAt && (
                        <p className="mt-2 text-xs text-emerald-200">
                          Gratis adgang indtil{" "}
                          {freePeriodEndsAt.toLocaleDateString("da-DK")}
                        </p>
                      )}
                      {!freePeriodActive && freeQuestionsRemaining > 0 && (
                        <p className="mt-2 text-xs text-emerald-200">
                          Gratis spørgsmål tilbage: {freeQuestionsRemaining}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {!isPro && (
                        <button
                          type="button"
                          onClick={handleStartSubscription}
                          className="rounded-full bg-accent px-6 py-3 text-xs font-semibold text-white"
                        >
                          Start abonnement
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleManageSubscription}
                        className="rounded-full border border-white/20 px-6 py-3 text-xs font-semibold text-slate-200 hover:border-white/40"
                      >
                        Administrer abonnement
                      </button>
                    </div>
                  </div>
                  {billingActionError && (
                    <p className="mt-3 text-xs text-rose-300">{billingActionError}</p>
                  )}
                </div>
              )}
              <div ref={chatPanelRef}>
                <ChatPanel
                  messages={messages}
                  showMessages={canViewHistory && hasAnswer}
                  locked={!canViewHistory}
                  emptyMessage="Ingen historik endnu. Start guiden for at se dine svar her."
                />
              </div>

              <div
                ref={answerPanelRef}
                className="rounded-3xl border border-white/10 bg-panel p-6"
              >
                <div>
                  <h2 className="text-2xl font-semibold">
                    {hasAnswer
                      ? "Stil et uddybende spørgsmål eller start forfra med et nyt emne"
                      : "Svar på lidt spørgsmål for at få et godt svar"}
                  </h2>
                  {!isPro && (
                    <p className="mt-2 text-sm text-slate-400">
                      Pro-funktioner som ekstra opfølgende spørgsmål og hurtigere
                      svar er låst, indtil betalingen er i orden.
                    </p>
                  )}
                </div>
                {!authUser && (
                  <div className="mt-4 rounded-3xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
                    <p className="font-semibold">
                      Guidet chat kræver en konto
                    </p>
                    <p className="mt-2 text-slate-300">
                      Log ind eller opret en bruger for at fortsætte og få sendt
                      dit spørgsmål til ChatGPT.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleAuthOpen("login")}
                        className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-slate-200 hover:border-white/40"
                      >
                        Log ind
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAuthOpen("signup")}
                        className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/20"
                      >
                        Opret bruger
                      </button>
                    </div>
                  </div>
                )}

                {isGuiding && currentQuestion && !hasAnswer && (
                  <div className="mt-5 space-y-4">
                    <ProgressIndicator
                      current={currentIndex + 1}
                      total={questions.length}
                    />
                    {isGeneratingQuestions ? (
                      <div className="rounded-3xl border border-white/10 bg-midnight/50 p-6 text-sm text-slate-300">
                        Vi analyserer dit første svar og formulerer de næste
                        spørgsmål. Vent venligst et øjeblik...
                      </div>
                    ) : (
                      <QuestionCard
                        question={currentQuestion}
                        value={state[currentQuestion.id]}
                        onChange={handleChange}
                        onSkip={handleSkip}
                        onStop={handleStop}
                        onNext={handleNext}
                        score={score}
                        disabled={isBusy}
                      />
                    )}
                  </div>
                )}

                {!isGuiding && !hasAnswer && (
                  <div className="mt-5 rounded-3xl border border-white/10 bg-midnight/50 p-6 text-sm text-slate-400">
                    Vent et øjeblik så vender jeg tilbage med et godt svar til dig
                  </div>
                )}

                <div className="mt-6">
                  {authUser && canSend && !hasAnswer ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={handleSend}
                      className="w-full rounded-full bg-accent px-6 py-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
                    >
                      {isSending
                        ? "Sender til ChatGPT..."
                        : "Send spørgsmålet til ChatGPT nu"}
                    </button>
                  ) : !hasAnswer ? (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-midnight/60 px-4 py-3 text-center text-xs text-slate-400">
                      {authUser
                        ? "Send-knappen vises når spørgsmålet scorer mindst 3/10."
                        : "Log ind for at kunne sende dit spørgsmål til ChatGPT."}
                    </div>
                  ) : null}
                </div>
                {(statusMessage || statusDetail) && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="mt-4 rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-center text-sm text-slate-200"
                  >
                    <p className="font-semibold">{statusMessage}</p>
                    {statusDetail && (
                      <p className="mt-2 text-slate-300">{statusDetail}</p>
                    )}
                  </div>
                )}

                {hasAnswer && (
                  <div className="mt-6 space-y-4">
                    {isFreeQuestionChat ? (
                      <div className="rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-slate-300">
                        Opgrader for opfølgende spørgsmål
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          Uddybende spørgsmål
                        </p>
                        <textarea
                          value={followUp}
                          onChange={(event) => setFollowUp(event.target.value)}
                          placeholder="Fx: Kan du forklare det med et enkelt eksempel?"
                          rows={3}
                          className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-midnight/60 px-5 py-4 text-base text-white outline-none focus:border-accent"
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={mailtoUrl || undefined}
                        aria-disabled={!mailtoUrl}
                        className={`rounded-full border border-white/20 px-6 py-3 text-base text-slate-200 transition ${
                          mailtoUrl
                            ? "hover:border-white/40"
                            : "cursor-not-allowed border-white/10 text-slate-500"
                        }`}
                      >
                        Send til e-mail
                      </a>
                      {!isFreeQuestionChat && (
                        <button
                          type="button"
                          disabled={isSending}
                          onClick={handleFollowUpSend}
                          className="rounded-full bg-accent px-6 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:bg-white/20"
                        >
                          Send uddybende spørgsmål
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={resetGuide}
                        disabled={isSending}
                        className="rounded-full border border-white/20 px-6 py-3 text-base text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                      >
                        Spørg om noget andet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isAdmin && (
          <section className="rounded-3xl border border-white/10 bg-white/5 p-8 text-left">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-white">Admin</h2>
              <p className="text-sm text-slate-400">
                Administrér Stripe-indstillinger og gratis adgang til brugere.
              </p>
            </div>
            {adminStatus === "loading" && (
              <p className="mt-4 text-sm text-slate-300">Henter admin-data...</p>
            )}
            {adminError && (
              <p className="mt-4 text-sm text-rose-300">{adminError}</p>
            )}
            {adminStatus === "ready" && (
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <form
                  onSubmit={handleBillingSettingsSave}
                  className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6"
                >
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Stripe-opsætning
                    </h3>
                    <p className="text-xs text-slate-400">
                      Angiv price ID og visningsinformation til abonnementet.
                    </p>
                  </div>
                  <label className="text-xs text-slate-300">
                    Stripe price ID
                    <input
                      type="text"
                      value={billingForm.stripePriceId}
                      onChange={(event) =>
                        handleBillingFormChange("stripePriceId", event.target.value)
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                      placeholder="price_123"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Stripe publishable key
                    <input
                      type="text"
                      value={billingForm.stripePublishableKey}
                      onChange={(event) =>
                        handleBillingFormChange(
                          "stripePublishableKey",
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                      placeholder="pk_live_..."
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-300">
                      Success URL
                      <input
                        type="url"
                        value={billingForm.successUrl}
                        onChange={(event) =>
                          handleBillingFormChange("successUrl", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="https://..."
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Cancel URL
                      <input
                        type="url"
                        value={billingForm.cancelUrl}
                        onChange={(event) =>
                          handleBillingFormChange("cancelUrl", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="https://..."
                      />
                    </label>
                  </div>
                  <label className="text-xs text-slate-300">
                    OpenAI model
                    <input
                      type="text"
                      value={billingForm.openaiModel}
                      onChange={(event) =>
                        handleBillingFormChange("openaiModel", event.target.value)
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                      placeholder="gpt-5-mini"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Portal return URL
                    <input
                      type="url"
                      value={billingForm.stripePortalReturnUrl}
                      onChange={(event) =>
                        handleBillingFormChange(
                          "stripePortalReturnUrl",
                          event.target.value
                        )
                      }
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                      placeholder="https://..."
                    />
                  </label>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-300">
                      Plan navn
                      <input
                        type="text"
                        value={billingForm.planName}
                        onChange={(event) =>
                          handleBillingFormChange("planName", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="NemtSvar Pro"
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Pris (øre)
                      <input
                        type="number"
                        min="0"
                        value={billingForm.planAmount}
                        onChange={(event) =>
                          handleBillingFormChange("planAmount", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="9900"
                      />
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-slate-300">
                      Valuta
                      <input
                        type="text"
                        value={billingForm.planCurrency}
                        onChange={(event) =>
                          handleBillingFormChange("planCurrency", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                        placeholder="DKK"
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Interval
                      <select
                        value={billingForm.planInterval}
                        onChange={(event) =>
                          handleBillingFormChange("planInterval", event.target.value)
                        }
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                      >
                        <option value="">Vælg interval</option>
                        <option value="month">Månedlig</option>
                        <option value="year">Årlig</option>
                        <option value="week">Ugentlig</option>
                        <option value="day">Daglig</option>
                      </select>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-accent px-6 py-3 text-xs font-semibold text-white"
                  >
                    Gem Stripe-opsætning
                  </button>
                </form>

                <div className="space-y-4 rounded-3xl border border-white/10 bg-slate-900/60 p-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white">
                      Gratis adgang til brugere
                    </h3>
                    <p className="text-xs text-slate-400">
                      Tildel gratis spørgsmål eller gratis perioder manuelt.
                    </p>
                  </div>
                  <div className="space-y-4">
                    {adminUsers.map((adminUser) => (
                      <div
                        key={adminUser.id}
                        className="rounded-2xl border border-white/10 bg-midnight/60 p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {adminUser.email}
                            </p>
                            <p className="text-xs text-slate-400">
                              Rolle: {adminUser.role}
                            </p>
                            <p className="text-xs text-slate-400">
                              Status:{" "}
                              {adminUser.blocked_at ? "Blokeret" : "Aktiv"}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleEntitlementSave(
                                  adminUser.id,
                                  adminUser.free_questions_remaining,
                                  adminUser.free_period_ends_at
                                )
                              }
                              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/40"
                            >
                              Gem
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBlockToggle(adminUser)}
                              disabled={adminActionUserId === adminUser.id}
                              className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
                            >
                              {adminUser.blocked_at ? "Afblokér" : "Blokér"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(adminUser)}
                              disabled={adminActionUserId === adminUser.id}
                              className="rounded-full border border-rose-400/60 px-4 py-2 text-xs font-semibold text-rose-200 hover:border-rose-400 disabled:cursor-not-allowed disabled:border-rose-900/40 disabled:text-rose-300/60"
                            >
                              Slet
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="text-xs text-slate-300">
                            Gratis spørgsmål
                            <input
                              type="number"
                              min="0"
                              value={adminUser.free_questions_remaining}
                              onChange={(event) =>
                                handleAdminUserFieldChange(
                                  adminUser.id,
                                  "free_questions_remaining",
                                  Number(event.target.value)
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                            />
                          </label>
                          <label className="text-xs text-slate-300">
                            Gratis periode til
                            <input
                              type="date"
                              value={formatDateInputValue(
                                adminUser.free_period_ends_at
                              )}
                              onChange={(event) =>
                                handleAdminUserFieldChange(
                                  adminUser.id,
                                  "free_period_ends_at",
                                  event.target.value
                                    ? new Date(
                                        `${event.target.value}T00:00:00Z`
                                      ).toISOString()
                                    : null
                                )
                              }
                              className="mt-2 w-full rounded-2xl border border-white/10 bg-midnight/60 px-4 py-3 text-sm text-white outline-none focus:border-accent"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                    {adminUsers.length === 0 && (
                      <p className="text-xs text-slate-400">
                        Ingen brugere fundet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
      {showAbout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6 py-10"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-nemtsvar-title"
          onClick={() => setShowAbout(false)}
        >
          <div
            className="w-full max-w-2xl rounded-3xl border border-white/10 bg-slate-950 p-6 text-left text-slate-200 shadow-2xl shadow-slate-900/50 sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6">
              <h2
                id="about-nemtsvar-title"
                className="text-2xl font-semibold text-white"
              >
                Om NemtSvar
              </h2>
              <button
                type="button"
                onClick={() => setShowAbout(false)}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-white/40"
              >
                Luk
              </button>
            </div>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-slate-300">
              <p>
                Mange oplever, at ny teknik kan være svær at bruge. Ikke fordi
                man ikke kan tænke selv – men fordi det ofte er uklart hvad man
                skal spørge om, og hvordan man formulerer det rigtigt for at få
                et godt og brugbart svar.
              </p>
              <p>
                Det gælder især, når man bruger moderne digitale værktøjer, hvor
                svaret i høj grad afhænger af, hvordan spørgsmålet stilles. Det
                kan være frustrerende – og få teknikken til at føles mere
                besværlig, end den behøver at være.
              </p>
              <p>NemtSvar er skabt for at ændre det.</p>
              <p>
                I stedet for at du selv skal finde de rigtige ord, guider
                NemtSvar dig trin for trin gennem nogle få, enkle spørgsmål i
                almindeligt dansk. Ud fra dine svar hjælper vi med at formulere
                et klart og præcist spørgsmål – og giver dig et svar, der
                faktisk er til at bruge.
              </p>
              <div>
                <p className="font-semibold text-slate-200">Du behøver:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>ikke være teknisk anlagt</li>
                  <li>ikke kende til smarte begreber</li>
                  <li>ikke vide, hvordan man “spørger rigtigt”</li>
                </ul>
              </div>
              <p>Det tager NemtSvar sig af.</p>
              <p>
                NemtSvar er lavet som en enkel og tryg Pro-løsning til en
                overkommelig pris, så flere kan få glæde af teknologien – uden
                at det bliver dyrt, besværligt eller uoverskueligt. Der er ingen
                binding, og du bestemmer selv, om og hvornår du vil bruge det.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
