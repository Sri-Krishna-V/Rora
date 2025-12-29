
export enum AgentStatus {
  IDLE = 'Idle',
  THINKING = 'Thinking...',
  DONE = 'Done',
  ERROR = 'Error'
}

export enum SupportedLanguage {
  JAVASCRIPT = 'JavaScript',
  TYPESCRIPT = 'TypeScript',
  PYTHON = 'Python'
}

export enum ModelTier {
  LITE = 'gemini-flash-lite-latest',
  FLASH = 'gemini-2.5-flash',
  PRO = 'gemini-3-pro-preview'
}

export interface TestCaseResult {
  id: string;
  name: string;
  status: 'pass' | 'fail';
  duration: number;
  code?: string;
  failureDetails?: {
    message: string;
    stack: string;
    expected?: string;
    received?: string;
  };
}

export interface TestSimulationResult {
  status: 'pass' | 'fail' | null;
  message: string;
  details?: TestCaseResult[];
}

export interface GenerationMetrics {
  latencyMs: number;
  tokenEstimate: number;
}