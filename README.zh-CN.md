# Siftlight

简体中文 · [English](README.md)

**Siftlight**，中文昵可以叫 **拾光**。

- **Sift**：从代码和噪音里筛出真正有用的信号。
- **Light**：把证据、范围和遗漏照亮。
- 不被 `grep` 绑死，以后扩展到结构分析、审计回执也装得下。
- 听起来是工具名，但不生硬，还有一点家里的气质。

英文标语：

**Siftlight — Evidence-first search for AI agents.**

**一个通用的本地搜索插件，让 Agent 更方便地查找文件、文档、笔记、日志和各类文本资料。**

它像一位耐心的图书管理员：你说想找什么，它帮你找到书架、翻到相关页面，再陪你沿着线索继续看。资料少时，直接把内容递给你；资料多时，先铺开一张地图，让你知道从哪里看起。

## 它能帮上什么忙

### 找一句话，不用翻完整个资料柜

想找一条报错、一段说明或某个名字，就像告诉管理员一本书里的关键词。命中不多时，插件直接给出原文和所在位置，省去逐个文件打开、来回翻找的过程。

### 资料很多，先给你地图

问“哪些资料提到退款”，可能一下找到很多内容。它会先整理相关文件和片段，像在地图上标出有线索的地点；Agent 可以先判断哪些值得看，再打开其中的原文，而不是一开始就面对满桌散页。

### 追问的时候，书签还在

你说“接着刚才的结果看”，它能沿着上次的位置继续翻页。也可以从某一条命中打开附近原文，像把书签夹在那一页，随时回来补看前因后果。

### 记得不完全准确，也能一次找回

当一句话可能记错了措辞时，可以用一个自然语言 `query` 调用 `mode: "hybrid"`。Hybrid 会在同一个受控请求中始终执行精确字面搜索和已安装的本地 Concept 模型：精确证据固定排在前面，语义候选明确标注且只表示相似度，与精确命中范围重叠的候选会被去重。初始页面共享计数、覆盖状态、来源引用和一个检查游标，以紧凑预览代替拼接两份完整响应。`conceptLimit` 只调整不重叠的语义补充数量（默认 3，最大 20），不会挤占字面证据；返回的 matches 请求从同一个快照开始完整的精确优先分页，不会重新执行任一搜索。

Concept 排名会覆盖请求所声明源码预算内接纳的全部 UTF-8 段落，不再固定抽取范围开头的一小部分。Concept 和 hybrid 默认会自动接纳最多 2,000 个文件，在内部按每批 200 个文件顺序处理，再合并成一次全局排名和一份覆盖结果。所有批次共享同一个请求的 32 MiB 读取预算，扩大文件上限不会把内容预算成倍放大。用户不需要自己计算或续接批次；只有确实想主动缩小范围时，才需要把 `maxFilesToParse` 作为可选的高级硬上限。超过模型 token 窗口的段落会拆成带重叠、且保证不截断的窗口参与排名，后半段内容不会被静默丢弃。离线 embedding 按内容、模型版本和分段版本缓存在本地，缓存上限为 512 MiB；重复内容直接复用，内容变化自然失效，缓存写入或清理失败会在结果中明确显示。

Concept 或 hybrid 较慢时，会在默认五秒等待窗口内返回 `status: "waiting"` 或 `"running"`、`operationId`、进度和精确的 `nextRequest`，例如 `{ "mode": "await", "operationId": "..." }`。请原样复制这个请求：它会续接同一个计算，不会重启查询，也不会降级成只有字面的结果。最终结果可稳定复取十分钟；每个服务会话最多保留 32 个终态结果。`mode: "cancel"` 会停止自有任务并等待清理完成。每个服务会话最多同时接纳八个 pending operation；单个 operation 使用 `SIFTLIGHT_CONCEPT_TIMEOUT_MS` 指定一个总执行时限（整数毫秒，1000–3600000，默认 600000），另有 120 秒无人续接租期。真实模型、来源或资源故障会以明确失败返回。发布结果前会重新枚举并校验同一来源 generation；源文件变化会刷新 operation，混合版本不会被标成 complete。接纳计划计数（`filesEnumerated`、`filesAdmitted`、`filesSkippedEmpty`、`filesUnavailable`、`passagesQueued`、`batchesPlanned`、`batchesCompleted`）会在结果里明确显示。空文件属于正常跳过，不会把结果标成 partial。

### 几个条件，可以一起交代

“找同时提到客户和退款的文件”，就像请管理员挑出同时贴着两张标签的资料；“这几个词任意一个出现都算”，则像列出一张候选清单。可以一次表达多个查找条件，减少反复搜索。

### 指定一个抽屉，就在里面找

需要只查某个文件夹时，可以明确告诉 Agent 限定范围。只记得文件名的一部分，也可以先找文件，再看内容。像先确定资料柜的哪一层，再逐步缩小到要找的那一份。

`files` 多词查询要求每个词都在路径中按字面出现；单个缩写仍支持模糊匹配。业务意图使用 `hybrid` 或 `concept`。普通内容搜索保留零匹配后扩大范围的既有默认；需要限定目录时传 `scope: "strict"`。范围扩大的提示会先于证据显示。

### 看到了多少，说得清楚

一页装不下的内容会分批展示，并提供继续查看的入口。原文发生变化时，也会提醒重新确认。像一位认真整理资料的助手，会把“已经看到的”和“还需要往后翻的”交代清楚。

完整快照表示匹配保留完整，不代表源码正文没有截断。长行摘录会明确标记限制，并给出最后一页之后仍可执行的 `inspectRequest`。需要更多结果时沿游标继续，不要仅为翻页而修改 limit 重搜。
Pi 和 OMP 的被动 session 状态会显示当前加载的包版本，统计已返回的新查询，区分完整、部分和未完成结果，并报告未取消的失败调用。cursor 与 operation 续接不会重复计入新查询。

普通搜索继续遵循仓库 ignore 规则，但只要存在被忽略文件，就会明确说明文件系统覆盖受策略过滤，不再把“接纳文件里没找到”说成“整个目录绝对不存在”。需要发布前收口时，可以用 `mode: "audit"` 配合带名字的字面量 `patterns`，一次拿到声明范围、枚举/搜索/跳过文件、ignore 策略、每个模式的 `present`、`absent_with_complete_coverage` 或 `unknown` 结论，以及搜索前后的来源稳定性。审计必须包含被忽略的配置或生成文件时，设置 `ignorePolicy: "include"`；`.git` 内部和受保护路径仍然不会开放。

### 先发现语言能力，再按需加载提供方

使用 `mode: "capabilities"` 和项目根目录，可以获取紧凑的文件语言清单。JavaScript、TypeScript 和 TSX 支持 AST 结构、角色、outline、静态 imports 和关联测试候选；Go 支持 AST 结构和角色；Python 支持基于缩进的有界 outline。Swift 和其他语言仍可使用普通内容搜索、文件发现和源码 inspect。能力清单不会启动 parser 或 Concept 模型。

语言服务导航不在范围内。请求 `definitions`、`references`、`implementations`、`callers`、`callees`、`dependencies`、`dependents`、`trace` 或 `impact` 都会明确报错——用文本搜索伪装精确导航，比直接说清楚更糟。使用期间不会启动任何语言服务。

### 校验已保存的源码证据

使用 `mode: "validate"` 加普通搜索或 analysis 的 `cursor`，可以按需传入 `matchIndex` 选择单项证据。校验将已保留源码与当前工作区或固定 Git 对象比较，报告 `current`、`stale` 或 `unknown`，并保留原搜索的不完整覆盖状态。结构化信息位于 `details.validation` 和 `details.analysis.validation`；旧关系图字段和 trace cursor 不再支持。校验按需读取源码，不启动后台监听；它验证已保存证据，不证明搜索后没有新增匹配文件。

### 按文件时间缩小范围，也可以看代码结构

工作区搜索支持用 Unix 毫秒时间戳传入 `modifiedAfter` 和 `modifiedBefore`。下界包含、上界不包含，因此可以准确表示一个时间窗口，不必改动搜索关键词。内容搜索和文件名搜索使用同一过滤条件；无法核验文件元数据时会明确报告证据不完整，不会静默当作命中。

对具体的 JS/TS/TSX 或 Python 文件使用 `mode: "outline"`，可以查看有界符号范围。JS/TS/TSX 使用 ast-grep，Python 使用基于缩进的类、函数和方法范围；它们不证明编译器绑定、运行时调用或测试覆盖。`mode: "tests"` 提供 JS/TS/TSX 关联测试候选，不支持的语言操作会明确报错。Swift 源码可使用普通搜索和 `inspect`。

可读正文会保持精简；每项证据的范围、计数、覆盖状态和继续请求仍保留在结构化 `details` 中，客户端无需为了拿到这些字段再次搜索。

## 常见用法

直接向 Agent 表达需求即可，例如：

- “帮我找一下，哪些文档提到了退款期限？”
- “这条报错在哪些日志里出现过？把附近的内容也给我看看。”
- “找同时包含客户名称和订单编号的文件。”
- “这几个关键词，任意一个出现都列出来。”
- “我只记得文件名里有会议记录，帮我找找。”
- “这次只查这个资料文件夹，不要扩大范围。”
- “先告诉我相关内容分布在哪些文件，再打开其中两份。”
- “接着刚才的位置继续看，把没展示完的部分找出来。”
- “按这个 Unix 毫秒时间戳之后修改过的文件搜索。”
- “这句话我可能记得不准确，把精确和语义证据一起找出来。”
- “列出这个 Python 文件里的类和函数，再打开需要看的方法。”
- “搜索这个函数名并查看相关源码；我修改文件后，再校验已保存的证据。”

插件提供文件位置和实际文本，帮助 Agent 根据原文回答，也方便你回到资料中核对。

## 安装

MCP 需要 Node.js 22.19+。Pi 需要 Pi 0.84.3+，以及 Node.js 22.19+ 或 Bun 1.4+。搜索引擎随包提供对应平台的版本，无需系统搜索工具、Shell 函数或额外设置 `PATH`，搜索过程也不会下载任何东西。安装时请保留可选依赖。

如果你从更早的包身份升级，请先移除此前安装的插件和 MCP 注册，再安装 Siftlight，避免同一宿主同时加载两套搜索工具或拦截钩子。

如需使用自己的 ripgrep，在 MCP 服务或 Pi 进程的环境变量中设置 `SIFTLIGHT_RG_PATH` 为可执行文件的绝对路径，然后重启宿主。该设置统一作用于内容、文件名和 Git 源文件搜索。路径中的空格可用；不支持别名、Shell 函数、相对路径或 `~` 展开。配置无效时明确报错，不会另选程序。随包引擎缺失时，请保留可选依赖重新安装，或把该项指向自己的二进制。

### Pi

```bash
pi install npm:siftlight
```

安装或更新后重启 Pi。Pi 默认让常规搜索使用本插件，读取、编辑、测试、构建和脚本仍可使用。`enforceSearch` 支持 `"hard"`（默认严格拦截）、`"prefer"`（保留专用工具和模型指引，但不拒绝其他搜索）和 `"off"`；布尔值及未知配置字段会直接报错。请在 `~/.pi/agent/siftlight.json` 中配置后重启；设置 `"locale": "zh-CN"` 可启用中文界面。

### OMP（Oh My Pi）

```bash
omp install npm:siftlight@latest
```

安装或更新后重启 OMP。安装包声明了 OMP 原生扩展并注册 `siftlight`。默认 hard 模式会从活动工具集中移除 OMP 内置的 `grep` 和 `glob`，并在执行前阻止直接搜索命令，同时保留读取、编辑、测试、构建和其他开发工具。prefer 模式会同时保留专用工具与其他搜索工具，加入模型指引，但不拒绝 shell 搜索。OMP 当前 profile 会被正确识别：默认配置文件是 `~/.omp/agent/siftlight.json`，命名 profile 使用 `~/.omp/profiles/<profile>/agent/siftlight.json`。在当前文件中将 `enforceSearch` 设置为 `"hard"`（默认）、`"prefer"` 或 `"off"` 后重启 OMP；布尔值及未知配置字段会直接报错。设置 `"locale": "zh-CN"` 可启用中文界面。

### 可选语义判断

Hybrid 搜索默认只使用本地能力。可选的语义判断器可以对保留的概念候选进行分类并改善排序，但不会替代本地匹配、源码检查、分页或验证。

只有在配置中明确设置 `semanticJudge.enabled` 为 `true` 时才会启用。仅定义环境变量不会激活网络请求。凭据应保留在进程环境变量中，不要把凭据值写进配置文件：

```json
{
  "locale": "zh-CN",
  "enforceSearch": "hard",
  "semanticJudge": {
    "enabled": false,
    "provider": "jev",
    "apiKeyEnv": "TYPESAFE_API_KEY",
    "model": "jev-latest",
    "timeoutMs": 120000,
    "maxCandidates": 20,
    "maxRetries": 2
  }
}
```

启用后，配置的端点只会收到查询和有界的候选摘录。每个请求最多包含八个候选和 64 KiB；独立批次仍受现有最多二十个候选的总上限约束，HTTP 413 只会拆分对应批次。某个批次失败时，其中的候选保持本地顺序，成功批次仍可提供分类；结果会明确标记为部分覆盖，并报告已判断/未判断候选及批次计数。缺少密钥仍会明确报配置错误，提供方失败绝不会删除本地候选，语义分类也不等同于运行时证明。

### Claude Code 或 Codex：连接 MCP

```bash
claude mcp add siftlight -- npx -y --package siftlight@latest siftlight-mcp --stdio
```

```bash
codex mcp add siftlight -- npx -y --package siftlight@latest siftlight-mcp --stdio
```

`@latest` 会在 MCP 启动时跟随最新发布版本，更新后重启宿主即可加载。服务器默认搜索当前项目，可用 `SIFTLIGHT_MCP_CWD` 指定其他根目录。仅连接 MCP 会添加工具，不会禁用其他搜索工具。

Pi 和 OMP 默认读取各自宿主的配置文件。如果希望所有宿主共用一份明确配置，可以在实际宿主进程环境中设置 `SIFTLIGHT_CONFIG`；它会同时覆盖 Pi、OMP 和 MCP 的宿主默认路径。Claude Code、Codex 和 Kimi 都是启动同一个独立 MCP 服务，因此要把这个变量放进各自 MCP 条目的 `env` 中，不能只依赖 Shell 启动文件：

```text
SIFTLIGHT_CONFIG=/absolute/path/to/siftlight.json
```

`TYPESAFE_API_KEY` 应保存在 MCP 进程环境或宿主的密钥管理中；不要把凭据值写进配置文件或提交到版本库的宿主清单。没有这个路径时，独立 MCP 会明确保持语义判断 disabled；路径被显式设置但文件不存在，或配置已启用但缺少 key 时，会在启动阶段失败，不会静默声称 Jev 已运行。启动诊断写入 stderr，hybrid 结果会暴露 `semanticJudge.status`；`judgedCandidates > 0` 证明至少一个远程批次已完成，`complete` 表示所有纳入判断的候选都已判断，`partial` 则会保留其余候选的本地顺序并明确标记为未判断。

MCP 默认同时返回可读文本和结构化证据。如果宿主会把两种形式一起序列化进模型上下文，请在该 MCP 服务的环境中设置 `SIFTLIGHT_MCP_OUTPUT_MODE=model`，然后重启。模型模式不返回 `structuredContent`，也不声明结构化输出 schema；它会提供精简的工作流说明，并在标准页和同一个已保留分析快照的紧凑视图中选择较小者。紧凑视图共享重复路径和 inspect 请求，hybrid 不会拼接两份独立的 literal 与 Concept 正文，并把 outline 签名延后到版本校验过的源码检查。计数、覆盖范围、部分状态、原因和续读请求仍然可见。`text` 模式只省略结构化输出，逐字保留标准文本和完整兼容说明；程序消费者或只展示结构化结果的客户端应继续使用默认的 `structured` 模式。其他取值会在启动时明确失败。捆绑的 Claude Code、Codex 和 Kimi 原生插件会选择 `model`；直接 MCP 连接仍保留兼容默认值，除非显式配置。

`paths` 只用于从已有 cursor 中精确选择已保留文件；新搜索只接受一个 `path`。多个互不相干的根目录应拆成独立请求，不要自动改成范围更大的共同父目录。Markdown 检查直接使用有界行窗口，不依赖 Universal Ctags；代码结构检查真的受到 provider 缺失影响时仍会明确报告。

### 原生插件

如果希望在其他宿主中也强制常规搜索使用本插件：

- **Claude Code：** 先运行 `/plugin marketplace add lightsifter/siftlight`，再运行 `/plugin install siftlight@siftlight`。
- **Codex：** 先运行 `codex plugin marketplace add lightsifter/siftlight`，再运行 `codex plugin add siftlight@siftlight`，通过 `/hooks` 查看并信任钩子。
- **Kimi Code：** 使用本仓库或安装包中的插件目录，运行 `/plugins install /absolute/path/plugins/siftlight`，确认信任后执行 `/reload`。

Kimi Code 的 web 模式可能从安装目录启动插件 MCP 服务。如果相对路径搜索解析到了错误项目，请继续使用原生插件强制搜索，并在项目内的 `.kimi-code/mcp.json` 中配置同名 `siftlight` 服务，显式填写该项目的绝对 `cwd`。

安装后重启。原生钩子默认使用严格模式。如需保留原生插件、MCP 工具和模型指引，但不硬性拒绝其他搜索，请使用 `SIFTLIGHT_ENFORCE_SEARCH=prefer` 启动宿主；设置为 `off` 只关闭钩子强制策略。可用值为 `hard`、`prefer` 和 `off`，非法值会安全拒绝并明确报错，不会静默放行。该设置由宿主进程继承，因此项目不能仅靠提交仓库配置文件降低用户的全局策略。仍可通过 Claude Code `/plugin`、Codex `/hooks`，或 Kimi `/plugins disable siftlight` 后执行 `/reload` 来关闭整个集成。

严格模式下，`grep warning report.txt` 这类直接搜索会被拒绝；`cat report.txt | grep warning` 仍可用，因为它只是过滤一个非搜索命令的输出。`find src | grep test` 和 `rg warning src | grep result` 仍会被拒绝，因为管道中已经包含直接搜索来源。复合 shell 调用中只要一个子命令被拒绝，宿主就不会执行其中任何操作；拒绝信息会指出检测到的搜索，并要求 Agent 单独重试非搜索操作。

本地搜索在你的机器上进行。请只允许 Agent 读取已获授权的文件。HTTP 服务对外开放前需要认证网关，详见[安全说明](SECURITY.md)。

[更新记录](CHANGELOG.md) · [参与贡献](CONTRIBUTING.md) · [AGPL-3.0-only 许可证](LICENSE)
