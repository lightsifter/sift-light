import { isAbsolute } from "node:path";
import { isRecordValue } from "./record-value.js";

export interface NativeTextConfig {
  executable: string;
  modelDirectory: string;
}

export function parseNativeTextConfig(
  value: unknown,
  field: "nativeText" | "nativeMedia" = "nativeText",
): NativeTextConfig | undefined {
  if (value === undefined) return undefined;
  if (
    !isRecordValue(value) ||
    Object.keys(value).some((key) => !["executable", "modelDirectory"].includes(key))
  )
    throw new Error(`${field} must contain executable and modelDirectory only`);
  const { executable, modelDirectory } = value;
  for (const path of [executable, modelDirectory]) {
    if (
      typeof path !== "string" ||
      !isAbsolute(path) ||
      path.length > 4096 ||
      /[\0\r\n]/u.test(path)
    )
      throw new Error(`${field} executable and modelDirectory must be absolute paths`);
  }
  return { executable: String(executable), modelDirectory: String(modelDirectory) };
}
