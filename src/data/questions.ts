export type PromptField =
  | "topic"
  | "role"
  | "outputType"
  | "context"
  | "constraints"
  | "audience"
  | "outputTypeDetail"
  | "avoid"
  | "examples"
  | "proQuestion1"
  | "proQuestion2"
  | "proQuestion3"
  | "proQuestion4"
  | "proQuestion5"
  | "proQuestion6"
  | "proQuestion7";

export type PromptQuestion = {
  id: PromptField;
  label: string;
  helper: string;
  placeholder: string;
  inputType?: "text" | "choice";
  choices?: string[];
};

export const promptQuestions: PromptQuestion[] = [
  {
    id: "topic",
    label: "Hvad vil du gerne have hjælp til – helt kort?",
    helper: "",
    placeholder: "Skriv kort hvad du vil have hjælp til...",
  },
  {
    id: "role",
    label: "Hvis du kunne ringe til en ekspert, hvem skulle det så være?",
    helper:
      "Fx jurist, marketingekspert, læge, programmør, lærer.",
    placeholder: "Skriv hvilken ekspert du ønsker...",
  },
  {
    id: "outputType",
    label: "Hvordan vil du gerne have svaret?",
    helper:
      "Fx kort forklaring, trin-for-trin, færdig tekst, liste med forslag.",
    placeholder: "Beskriv ønsket svarformat...",
  },
  {
    id: "context",
    label: "Hvad er situationen lige nu?",
    helper: "Beskriv baggrunden eller situationen for dit spørgsmål.",
    placeholder: "Beskriv situationen...",
  },
  {
    id: "constraints",
    label: "Er der noget, vi skal tage særligt hensyn til?",
    helper:
      "Fx tone, sprog, længde, målgruppe.",
    placeholder: "Beskriv hensyn eller begrænsninger...",
  },
  {
    id: "audience",
    label: "Hvem er svaret til?",
    helper:
      "Er svaret primært til dig selv – eller til andre? (fx kunder, familie, kolleger, børn)",
    placeholder: "Beskriv målgruppen...",
  },
  {
    id: "outputTypeDetail",
    label: "Skal svaret munde ud i noget konkret?",
    helper: "Fx mail, plan, beslutning, tekst, kode.",
    placeholder: "Beskriv den ønskede leverance...",
  },
  {
    id: "avoid",
    label: "Er der noget, vi især skal undgå?",
    helper: "Er der noget, du allerede ved ikke virker – eller ikke ønsker?",
    placeholder: "Beskriv hvad der skal undgås...",
  },
  {
    id: "examples",
    label: "Er der et eksempel, der ligner din situation?",
    helper:
      "Hvis du vil, kan du nævne et eksempel, en erfaring eller noget du allerede har prøvet. (Helt frivilligt)",
    placeholder: "Beskriv et eksempel...",
  },
];
