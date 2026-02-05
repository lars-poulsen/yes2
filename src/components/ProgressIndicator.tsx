type ProgressIndicatorProps = {
  current: number;
  total: number;
};

const ProgressIndicator = ({ current, total }: ProgressIndicatorProps) => {
  const progress = Math.round((current / total) * 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>
          Spørgsmål {current} / {total}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10">
        <div
          className="h-2 rounded-full bg-accent"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressIndicator;
