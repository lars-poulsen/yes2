import type { PromptQuestion } from "../data/questions";
import ScoreBadge from "./ScoreBadge";

type QuestionCardProps = {
  question: PromptQuestion;
  value: string;
  onChange: (value: string) => void;
  onSkip: () => void;
  onStop: () => void;
  onNext: () => void;
  score: number;
  disabled?: boolean;
};

const QuestionCard = ({
  question,
  value,
  onChange,
  onSkip,
  onStop,
  onNext,
  score,
  disabled = false,
}: QuestionCardProps) => (
  <div className="rounded-3xl border border-white/10 bg-panel p-6 shadow-lg">
    <p className="text-sm uppercase tracking-wide text-slate-400">
      Guidet spørgsmål
    </p>
    <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
      <h3 className="text-2xl font-semibold">{question.label}</h3>
      <ScoreBadge score={score} />
    </div>
    {question.helper && (
      <p className="mt-2 text-base text-slate-300">{question.helper}</p>
    )}

    <div className="mt-5">
      <p className="text-sm text-slate-400">
        Brug gerne dine egne ord. Du kan altid springe over eller stoppe.
      </p>
    </div>

    {question.inputType === "choice" ? (
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {question.choices?.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onChange(choice)}
            disabled={disabled}
            className={`rounded-2xl border px-5 py-4 text-left text-base transition ${
              value === choice
                ? "border-accent bg-accent/20 text-white"
                : "border-white/10 bg-midnight/50 text-slate-200 hover:border-white/30"
            } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {choice}
          </button>
        ))}
      </div>
    ) : (
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={question.placeholder || "Fx: Skriv kort, hvad du ønsker hjælp til..."}
        rows={4}
        className="mt-4 w-full resize-none rounded-2xl border border-white/10 bg-midnight/60 px-5 py-4 text-base text-white outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      />
    )}

    <div className="mt-5 flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="rounded-full bg-accent px-6 py-3 text-base font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-white/20"
      >
        Gem og fortsæt
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="rounded-full border border-white/20 px-6 py-3 text-base text-slate-200 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Spring over
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={disabled}
        className="rounded-full border border-white/10 px-6 py-3 text-base text-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        Stop guiden
      </button>
    </div>
  </div>
);

export default QuestionCard;
