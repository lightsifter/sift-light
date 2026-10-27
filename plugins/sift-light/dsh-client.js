window.__ModuleLoader__.load({ id: "sift-light", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// src/dsh-client.mjs
var exports_dsh_client = {};
__export(exports_dsh_client, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(exports_dsh_client);
var React = __toESM(require("react"), 1);
var h = React.createElement;
var colors = ["#d91870", "#df7800", "#ba9400", "#23864a", "#008eab", "#8852d7"];
var color = (index) => colors[index % colors.length];
var styles = {
  card: {
    border: "1px solid var(--dsw-alias-border-l1, #e5e7eb)",
    background: "var(--dsw-alias-bg-layer-1, #fff)",
    borderRadius: 14,
    margin: "6px 0",
    color: "var(--dsw-alias-label-primary, #171923)",
    fontSize: 13,
    lineHeight: 1.45,
    overflow: "hidden"
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: "15px 18px 10px"
  },
  label: { color: "var(--dsw-alias-label-secondary, #656b78)", fontSize: 12 },
  query: {
    margin: "0 18px",
    padding: "8px 10px",
    borderRadius: 7,
    background: "color-mix(in srgb, var(--dsw-alias-label-primary, #171923) 5%, transparent)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    overflowWrap: "anywhere",
    fontSize: 12
  },
  overview: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "12px 32px",
    padding: "16px 18px 14px"
  },
  metric: { display: "flex", alignItems: "baseline", gap: 8, whiteSpace: "nowrap" },
  number: {
    fontSize: 36,
    lineHeight: 1,
    fontWeight: 750,
    letterSpacing: "-0.04em",
    fontVariantNumeric: "tabular-nums",
    color: "#d91870"
  },
  distribution: { flex: "1 1 190px", minWidth: 0 },
  strip: {
    display: "flex",
    height: 7,
    overflow: "hidden",
    borderRadius: 99,
    background: "color-mix(in srgb, var(--dsw-alias-label-primary, #171923) 9%, transparent)",
    marginTop: 8
  },
  rows: { padding: "0 18px 14px" },
  row: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "4px 12px",
    alignItems: "center",
    padding: "7px 0"
  },
  file: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
    border: 0,
    padding: 0,
    background: "none",
    color: "inherit",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12
  },
  path: { overflowWrap: "anywhere", minWidth: 0 },
  badge: { fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 12 },
  bar: {
    gridColumn: "1 / -1",
    height: 4,
    borderRadius: 99,
    background: "color-mix(in srgb, var(--dsw-alias-label-primary, #171923) 8%, transparent)",
    overflow: "hidden"
  },
  details: {
    borderTop: "1px solid var(--dsw-alias-border-l1, #e5e7eb)",
    padding: "10px 18px 12px"
  },
  output: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    fontSize: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    margin: "10px 0 0"
  }
};
function callArgs(block) {
  const raw = block.call?.argsRaw ?? block.argsRaw;
  if (typeof raw !== "string")
    return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
function outputText(block) {
  if (!Array.isArray(block.content))
    return "";
  return block.content.filter((item) => item && item.type === "text" && typeof item.text === "string").map((item) => item.text).join(`
`);
}
function searchCard({ block, phase, openFile, locale }) {
  const currentLocale = React.useSyncExternalStore((listener) => locale.subscribe(listener), () => locale.getSnapshot(), () => locale.getSnapshot());
  const chinese = currentLocale.active.toLowerCase().startsWith("zh");
  const args = callArgs(block);
  const query = args.pattern ?? args.query ?? args.symbol;
  const view = block.meta;
  const valid = view && typeof view === "object" && Number.isSafeInteger(view.total) && Number.isSafeInteger(view.files) && Array.isArray(view.rows);
  const text = outputText(block);
  const pending = phase !== "result";
  const incomplete = !pending && (block.isError || valid && view.partial);
  const status = pending ? chinese ? "正在搜索" : "Searching" : block.isError ? chinese ? "搜索未完成" : "Search incomplete" : valid && view.partial ? chinese ? "结果不完整" : "Partial results" : chinese ? "搜索完成" : "Search complete";
  const unit = valid && view.unit === "files" ? chinese ? "个文件" : view.total === 1 ? "file" : "files" : valid && view.unit === "locations" ? chinese ? "个位置" : view.total === 1 ? "location" : "locations" : chinese ? "条结果" : view.total === 1 ? "result" : "results";
  const allRows = valid ? view.rows.filter((row) => row && typeof row.path === "string" && Number.isSafeInteger(row.matches) && row.matches >= 0) : [];
  const rows = allRows.slice(0, 8);
  const max = Math.max(1, ...rows.map((row) => row.matches));
  const pageTotal = allRows.reduce((sum, row) => sum + row.matches, 0);
  const denominator = valid ? Math.max(view.pageOnly ? pageTotal : view.total, pageTotal, 1) : 1;
  return h("section", { style: styles.card, "aria-label": "sift-light" }, h("div", { style: styles.header }, h("strong", { style: { fontSize: 14, letterSpacing: "-0.01em" } }, "sift-light"), h("span", { style: { ...styles.label, display: "inline-flex", alignItems: "center", gap: 6 } }, h("span", {
    "aria-hidden": true,
    style: {
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: incomplete ? "#d88912" : pending ? "#8852d7" : "#23864a"
    }
  }), status)), typeof query === "string" && query ? h("div", { style: styles.query }, query) : null, valid ? h("div", { style: styles.overview }, h("div", { style: styles.metric }, h("span", { style: styles.number }, String(view.total)), h("span", { style: styles.label }, unit)), h("div", { style: styles.metric }, h("span", {
    style: {
      ...styles.number,
      fontSize: 24,
      color: "var(--dsw-alias-label-primary, #171923)"
    }
  }, String(view.files)), h("span", { style: styles.label }, chinese ? "个文件" : view.files === 1 ? "file" : "files")), rows.length && !view.inspection ? h("div", { style: styles.distribution }, h("div", { style: styles.label }, view.pageOnly ? chinese ? "本页文件分布" : "Files on this page" : chinese ? "文件分布" : "File distribution"), h("div", { style: styles.strip, "aria-hidden": true }, ...rows.map((row, i) => h("span", {
    key: `${i}:${row.path}`,
    style: {
      width: `${row.matches / denominator * 100}%`,
      background: color(i)
    }
  })))) : null) : null, valid && rows.length ? h("div", { style: styles.rows }, ...rows.map((row, i) => h("div", { style: styles.row, key: `${i}:${row.path}` }, h("button", {
    type: "button",
    style: styles.file,
    title: row.path,
    onClick: () => openFile(row.path)
  }, h("span", {
    "aria-hidden": true,
    style: {
      width: 4,
      alignSelf: "stretch",
      minHeight: 15,
      flexShrink: 0,
      borderRadius: 4,
      background: color(i)
    }
  }), h("span", { style: styles.path }, row.path)), h("span", { style: styles.badge }, String(row.matches)), !view.inspection ? h("div", { style: styles.bar, "aria-hidden": true }, h("div", {
    style: {
      height: "100%",
      width: `${row.matches / max * 100}%`,
      background: color(i),
      borderRadius: 99
    }
  })) : null)), view.rows.length > rows.length ? h("div", { style: styles.label }, chinese ? `另有 ${view.rows.length - rows.length} 个文件未展示` : `${view.rows.length - rows.length} more files not shown`) : null) : valid && view.total === 0 ? h("div", { style: { ...styles.rows, ...styles.label } }, chinese ? "没有找到匹配结果" : "No results found") : null, valid && view.more ? h("div", { style: { ...styles.rows, ...styles.label } }, chinese ? "还有后续结果" : "More results available") : null, text ? h("details", { style: styles.details }, h("summary", { style: { ...styles.label, cursor: "pointer" } }, chinese ? "查看搜索详情" : "View search details"), h("pre", { style: styles.output }, text)) : null);
}
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({ name: "tool.call.toolview", key: "sift_light" }, (props) => h(searchCard, { ...props, locale: ctx.locale })));
}

return module.exports;
} });
