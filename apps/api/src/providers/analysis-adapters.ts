import type { AnalysisInput } from "./types";

export interface ProbeResult {
  durationMs: number;
  /** Scene/action boundaries. The orchestrator always adds 0 and durationMs. */
  boundariesMs?: readonly number[];
  changePoints?: readonly { atMs: number; kind?: string }[];
}

export interface ProbeAdapter {
  probe(input: { asset: AnalysisInput["assets"][number] }): Promise<ProbeResult>;
}

export interface TimedTextFinding {
  startMs: number;
  endMs: number;
  text: string;
  confidence: number;
  language?: string;
}

export interface AsrAdapter {
  transcribe(input: { asset: AnalysisInput["assets"][number]; durationMs: number; keyframesMs?: readonly number[] }): Promise<readonly TimedTextFinding[]>;
}

export interface OcrAdapter {
  detect(input: { asset: AnalysisInput["assets"][number]; durationMs: number; keyframesMs?: readonly number[] }): Promise<readonly TimedTextFinding[]>;
}

export interface MultimodalLabel {
  label: string;
  confidence: number;
  description?: string;
}

export type RiskKind = "watermark" | "prohibited_claim" | "personal_data" | "unsafe_action" | "copyright" | "other";
export type RiskSeverity = "low" | "medium" | "high";

export interface MultimodalRisk {
  kind: RiskKind;
  severity: RiskSeverity;
  description: string;
  confidence: number;
}

export interface MultimodalInterpretation {
  labels: readonly MultimodalLabel[];
  risks: readonly MultimodalRisk[];
}

export interface MultimodalAdapter {
  interpret(input: {
    segment: { sourceAssetId: string; startMs: number; endMs: number };
    keyframesMs?: readonly number[];
  }): Promise<MultimodalInterpretation>;
}

export interface AnalysisAdapters {
  probe: ProbeAdapter;
  asr: AsrAdapter;
  ocr: OcrAdapter;
  multimodal: MultimodalAdapter;
}
