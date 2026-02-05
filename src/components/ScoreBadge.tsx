import { scoreLabel } from "../lib/promptBuilder";

type ScoreBadgeProps = {
  score: number;
};

const ScoreBadge = ({ score }: ScoreBadgeProps) => {
  const label = scoreLabel(score);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-3">
      <span className="text-sm text-slate-400">Spørgsmålets kvalitet</span>
      <span className="text-lg font-semibold text-white">
        {score}/10 – {label}
      </span>
    </div>
  );
};

export default ScoreBadge;
