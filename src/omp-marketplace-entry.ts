import { registerOmpSiftLightExtension } from "./omp-index.js";

export default async function marketplaceSiftLightExtension(
  pi: Parameters<typeof registerOmpSiftLightExtension>[0],
): Promise<void> {
  await registerOmpSiftLightExtension(pi, new URL("./hooks/", import.meta.url));
}
