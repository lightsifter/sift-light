const inheritedNames = new Set([
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
]);

function validToolName(name: string): boolean {
  return !name.startsWith("__") && !inheritedNames.has(name);
}

function validJsonObject(value: string): boolean {
  // Normalize a safe subset of JavaScript object literals into JSON without
  // evaluating code. Template strings are allowed only without interpolation.
  // Values remain literals; computed keys and expressions fail.
  let normalized = "";
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote === "`") {
      if (escaped) {
        if (char !== undefined) normalized += JSON.stringify(char).slice(1, -1);
        escaped = false;
      } else if (char === "\\") {
        normalized += "\\\\";
        escaped = true;
      } else if (char === "`") {
        normalized += '"';
        quote = "";
      } else if (char === "$" && value[index + 1] === "{") {
        return false;
      } else if (char !== undefined) {
        normalized += JSON.stringify(char).slice(1, -1);
      }
      continue;
    }
    if (quote === '"') {
      normalized += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quote = "";
      continue;
    }
    if (quote === "'") {
      if (escaped) {
        if (char === "'") normalized += "'";
        else if (char && '"\\/bfnrtu'.includes(char)) normalized += `\\${char}`;
        else return false;
        escaped = false;
      } else if (char === "\\") escaped = true;
      else if (char === "'") {
        normalized += '"';
        quote = "";
      } else if (char === '"') normalized += '\\"';
      else if (char && char.charCodeAt(0) < 0x20) return false;
      else normalized += char;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      normalized += '"';
    } else {
      normalized += char;
      if (char === "{" || char === ",") {
        const key = /^(\s*)([A-Za-z_$][\w$]*)(\s*:)/u.exec(value.slice(index + 1));
        if (key?.[1] !== undefined && key[2] && key[3] !== undefined) {
          normalized += `${key[1]}"${key[2]}"${key[3]}`;
          index += key[0].length;
        }
      }
    }
  }
  if (quote || escaped) return false;
  try {
    const parsed: unknown = JSON.parse(normalized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

// Only JSON-compatible literals are admitted: expressions inside arguments could access
// the runtime without passing through the nested tool policy.
function isDirectBatch(code: string): boolean {
  const forms = [
    /^\s*return\s+await\s+Promise\.all\(\s*\[([\s\S]*)\]\s*\)\s*;?\s*$/u,
    /^\s*console\.log\(\s*await\s+Promise\.all\(\s*\[([\s\S]*)\]\s*\)\s*\)\s*;?\s*$/u,
  ];
  const outer = forms.map((form) => form.exec(code)).find(Boolean);
  if (!outer?.[1]) return false;
  const calls = outer[1];
  let cursor = 0;
  let count = 0;
  while (cursor < calls.length) {
    const prefix = /^\s*tools\.([A-Za-z_$][\w$]*)\s*\(\s*/u.exec(calls.slice(cursor));
    if (!prefix?.[1] || !validToolName(prefix[1])) return false;
    cursor += prefix[0].length;
    if (calls[cursor] !== "{") return false;
    const start = cursor;
    let depth = 0;
    let quote = "";
    let escaped = false;
    for (; cursor < calls.length; cursor++) {
      const char = calls[cursor];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
      } else if (char === '"' || char === "'" || char === "`") quote = char;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) {
        cursor++;
        break;
      }
    }
    if (depth !== 0 || !validJsonObject(calls.slice(start, cursor))) return false;
    const suffix = /^\s*\)\s*(,|$)/u.exec(calls.slice(cursor));
    if (!suffix) return false;
    cursor += suffix[0].length;
    count++;
    if (count > 10) return false;
    if (suffix[1] !== "," || calls.slice(cursor).trim() === "")
      return calls.slice(cursor).trim() === "";
  }
  return false;
}

/** Permit direct tool invocations; DSH applies its policy to each nested call. */
export function isDirectPtcToolCall(value: unknown): boolean {
  if (typeof value !== "object" || value === null || !("code" in value)) return false;
  const code = value.code;
  if (typeof code !== "string" || code.length > 100_000) return false;
  const forms = [
    /^\s*await\s+tools\.([A-Za-z_$][\w$]*)\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/u,
    /^\s*return\s+await\s+tools\.([A-Za-z_$][\w$]*)\s*\(\s*(\{[\s\S]*\})\s*\)\s*;?\s*$/u,
    /^\s*console\.log\(\s*await\s+tools\.([A-Za-z_$][\w$]*)\s*\(\s*(\{[\s\S]*\})\s*\)\s*\)\s*;?\s*$/u,
    /^\s*console\.log\(\s*JSON\.stringify\(\s*await\s+tools\.([A-Za-z_$][\w$]*)\s*\(\s*(\{[\s\S]*\})\s*\)\s*\)\s*\)\s*;?\s*$/u,
  ];
  const match = forms.map((form) => form.exec(code)).find(Boolean);
  if (match?.[1] && match[2]) return validToolName(match[1]) && validJsonObject(match[2]);
  return isDirectBatch(code);
}
