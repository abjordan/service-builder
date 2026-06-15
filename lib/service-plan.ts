// Service plan schema.
//
// A ServicePlan is the parser's structured output: the order of service plus all
// the content the downstream renderer needs (liturgy lines, song references,
// reading citations). It deliberately stays close to the bulletin's own structure
// so the editor UI can present it as a faithful, lossless representation.
//
// Downstream stages (renderer, OBS emitter) consume this schema; they should not
// look at the raw PDF text.

export type Speaker = "P" | "C" | "A" | "L";

export type LiturgyItem =
  | { kind: "spoken"; speaker: Speaker; text: string }
  | { kind: "rubric"; text: string };

// Every Section variant carries this shared field. Undefined means "include"
// (the default for most sections); the parser sets it to false for a handful
// of known-bulletin-only sections (Introit, Acknowledgments, Resources for
// Meditation, Communion Theology and Practice). The editor exposes this as a
// per-section checkbox.
type SectionBase = {
  includeInSlides?: boolean;
};

export type LiturgyBlock = SectionBase & {
  kind: "liturgy";
  title?: string;
  items: LiturgyItem[];
};

export type Song = SectionBase & {
  kind: "song";
  title: string;
  // Optional LSB (or other hymnal) reference. Most contemporary songs won't have
  // this; LSB hymnal numbers and liturgy-text citations (e.g. Nicene Creed
  // "LSB 158") both go here.
  hymnal?: { source: "LSB"; number: string };
  // Comma-separated author list as it appears in the bulletin
  // (e.g. "Brown, Riley", "Baloche, Kerr, Mellinger, Rabe").
  authors?: string;
  // Free-form stanza plan from the bulletin, e.g.
  // "Verse, Chorus 1, Verse, Chorus 2, Bridge, Chorus 2".
  stanzaPlan?: string;
};

export type Reading = SectionBase & {
  kind: "reading";
  title: string;
  citation: string;
};

export type SectionHeader = SectionBase & {
  kind: "header";
  title: string;
};

export type Note = SectionBase & {
  kind: "note";
  title?: string;
  text: string;
};

export type Section = LiturgyBlock | Song | Reading | SectionHeader | Note;

export type ServicePlanMetadata = {
  // ISO 8601 date (YYYY-MM-DD).
  serviceDate: string;
  // e.g. "10:45 AM" — preserved as-is from the bulletin.
  serviceTime?: string;
  // e.g. "Third Sunday after Pentecost".
  liturgicalDay: string;
  church: {
    name: string;
    address?: string;
    web?: string;
    phone?: string;
  };
  pastor?: string;
};

export type ServicePlan = {
  metadata: ServicePlanMetadata;
  sections: Section[];
};

// Parser output. `warnings` lets the parser flag ambiguity without failing —
// the review UI shows these next to the affected sections so the user can fix.
export type ParseWarning = {
  message: string;
  severity: "info" | "warn" | "error";
  // Optional pointer to a section index or raw-text line number for highlighting.
  sectionIndex?: number;
  lineHint?: string;
};

export type ParseResult = {
  plan: ServicePlan;
  warnings: ParseWarning[];
};
