import type { PromptField } from "../data/questions";

export type PromptState = Record<PromptField, string>;

export const emptyPromptState: PromptState = {
  topic: "",
  role: "",
  outputType: "",
  context: "",
  constraints: "",
  audience: "",
  outputTypeDetail: "",
  avoid: "",
  examples: "",
  proQuestion1: "",
  proQuestion2: "",
  proQuestion3: "",
  proQuestion4: "",
  proQuestion5: "",
  proQuestion6: "",
  proQuestion7: "",
};

export const promptFieldLabels: Record<PromptField, string> = {
  topic: "Hvad vil du gerne have hjælp til",
  role: "Ønsket ekspertrolle",
  outputType: "Ønsket svarformat",
  context: "Situation",
  constraints: "Hensyn",
  audience: "Målgruppe",
  outputTypeDetail: "Konkrete leverancer",
  avoid: "Undgå",
  examples: "Eksempel",
  proQuestion1: "Opfølgende spørgsmål 1",
  proQuestion2: "Opfølgende spørgsmål 2",
  proQuestion3: "Opfølgende spørgsmål 3",
  proQuestion4: "Opfølgende spørgsmål 4",
  proQuestion5: "Opfølgende spørgsmål 5",
  proQuestion6: "Opfølgende spørgsmål 6",
  proQuestion7: "Opfølgende spørgsmål 7",
};

export const buildPrompt = (state: PromptState): string => {
  const sections = buildSummaryBullets(state);

  return sections
    ? `Du er en hjælpsom assistent. Brug informationen her:\n${sections}`
    : "Besvar brugerens spørgsmål så godt som muligt.";
};

export const scorePrompt = (state: PromptState): number =>
  Object.values(state).filter((value) => value.trim().length > 0).length;

export const scoreLabel = (score: number): string => {
  if (score <= 2) return "For upræcis";
  if (score === 3) return "Under middel";
  if (score <= 5) return "God";
  if (score <= 7) return "Meget god";
  return "Fantastisk";
};

export const buildPromptPayload = (state: PromptState) => ({
  metadata: {
    version: "v1",
    createdAt: new Date().toISOString(),
  },
  fields: state,
  score: scorePrompt(state),
});

export const buildSummaryBullets = (state: PromptState): string => {
  const entries = Object.entries(state).filter(
    ([, value]) => value.trim().length > 0
  );
  if (entries.length === 0) return "";
  return entries
    .map(([key, value]) => `- ${promptFieldLabels[key as PromptField]}: ${value}`)
    .join("\n");
};
