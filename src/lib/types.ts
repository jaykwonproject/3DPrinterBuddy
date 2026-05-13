export type { ScadGenerationInput } from "@/lib/prompts";

export interface GenerateScadRequest {
  description: string;
  width: number;
  height: number;
  depth: number;
  notes?: string;
  sketch?: string;
}

export interface RepairScadRequest {
  brokenScad: string;
  errorMessage: string;
  originalInput: GenerateScadRequest;
}

export interface ScadResponse {
  scad: string;
}

export interface ErrorResponse {
  error: string;
}
