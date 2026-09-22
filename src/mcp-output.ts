export const DEFAULT_MCP_OUTPUT_MODE = "structured";

export type SiftLightMcpOutputMode = "structured" | "text" | "model";

export function parseSiftLightMcpOutputMode(value: string | undefined): SiftLightMcpOutputMode {
  if (value === undefined || value === DEFAULT_MCP_OUTPUT_MODE) return DEFAULT_MCP_OUTPUT_MODE;
  if (value === "text" || value === "model") return value;
  throw new Error('SIFT_LIGHT_MCP_OUTPUT_MODE must be "structured", "text", or "model"');
}
