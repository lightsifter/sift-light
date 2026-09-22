export const DEFAULT_MCP_OUTPUT_MODE = "structured";

export type SiftlightMcpOutputMode = "structured" | "text" | "model";

export function parseSiftlightMcpOutputMode(value: string | undefined): SiftlightMcpOutputMode {
  if (value === undefined || value === DEFAULT_MCP_OUTPUT_MODE) return DEFAULT_MCP_OUTPUT_MODE;
  if (value === "text" || value === "model") return value;
  throw new Error('SIFTLIGHT_MCP_OUTPUT_MODE must be "structured", "text", or "model"');
}
