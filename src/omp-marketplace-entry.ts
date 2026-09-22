import { registerOmpSiftlightExtension } from "./omp-index.js";

export default async function marketplaceSiftlightExtension(
  pi: Parameters<typeof registerOmpSiftlightExtension>[0],
): Promise<void> {
  await registerOmpSiftlightExtension(pi, new URL("./hooks/", import.meta.url));
}
