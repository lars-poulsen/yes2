import type { PromptState } from "../lib/promptBuilder";
import { buildPrompt, promptFieldLabels } from "../lib/promptBuilder";

type PromptPreviewProps = {
  state: PromptState;
};

const PromptPreview = ({ state }: PromptPreviewProps) => {
  const prompt = buildPrompt(state);
  const entries = Object.entries(state).filter(
    ([, value]) => value.trim().length > 0
  );

  return (
    <section className="space-y-6">
      <header>
        <p className="text-sm uppercase tracking-wide text-slate-400">
          Spørgsmåls-preview
        </p>
        <h2 className="text-2xl font-semibold">Samlet spørgsmål</h2>
      </header>

      <div className="rounded-2xl border border-white/10 bg-panel p-5 text-sm leading-relaxed text-slate-200">
        <pre className="whitespace-pre-wrap">{prompt}</pre>
      </div>

      <div className="rounded-2xl border border-white/10 bg-panel p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Struktureret objekt
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-slate-200">
          {entries.length === 0 && (
            <li className="text-slate-500">Ingen felter udfyldt endnu.</li>
          )}
          {entries.map(([key, value]) => (
            <li key={key} className="flex flex-col">
              <span className="text-slate-400">
                {promptFieldLabels[key as keyof PromptState]}
              </span>
              <span>{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default PromptPreview;
