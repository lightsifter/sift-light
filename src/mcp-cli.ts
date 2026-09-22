export type SiftLightMcpTransport = "http" | "stdio";

export const SIFT_LIGHT_MCP_USAGE = `Usage: sift-light-mcp [--http | --stdio]

Transports:
  --http   Start the Streamable HTTP server (default)
  --stdio  Serve one local MCP client over stdin/stdout
`;

export function parseSiftLightMcpTransport(
  arguments_: readonly string[],
): SiftLightMcpTransport | "help" {
  if (arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === "--http")) {
    return "http";
  }
  if (arguments_.length === 1 && arguments_[0] === "--stdio") return "stdio";
  if (arguments_.length === 1 && (arguments_[0] === "--help" || arguments_[0] === "-h")) {
    return "help";
  }
  throw new Error(`Unknown arguments: ${arguments_.join(" ")}\n${SIFT_LIGHT_MCP_USAGE}`);
}
