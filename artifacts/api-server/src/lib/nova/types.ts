export type NovaToolRisk = "read" | "write" | "financial" | "external";

export interface NovaToolDefinition {
  name: string;
  description: string;
  risk: NovaToolRisk;
  requiresApproval: boolean;
}

export interface NovaToolContext {
  ownerId: string;
}

export interface NovaToolResult<T = unknown> {
  ok: boolean;
  tool: string;
  data?: T;
  error?: string;
  requiresApproval?: boolean;
}

export interface NovaTool<TInput = unknown, TOutput = unknown> extends NovaToolDefinition {
  execute(input: TInput, context: NovaToolContext): Promise<NovaToolResult<TOutput>>;
}

export interface NovaCommandRequest {
  tool: string;
  input?: unknown;
}
