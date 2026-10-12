import type { NativeTextConfig } from "./native-text-config.js";

/**
 * A provider-owned multimodal retrieval endpoint.
 *
 * The endpoint receives bounded file bytes and a text or image query and
 * returns normalized media hits. Source paths and page verification remain
 * local to sift-light; the remote service only sees opaque file ids.
 */
export interface HttpMediaConfig {
  provider: "http-json";
  endpoint: string;
  apiKeyEnv?: string;
  model: string;
  timeoutMs: number;
  maxRetries: number;
  maxRequestBytes: number;
  renderer?: NativeTextConfig;
}

export type MediaConfig = HttpMediaConfig;
