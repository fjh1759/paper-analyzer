# 文献结构化分析数据契约

版本：`1.0.0`。一份 JSON 对应一篇论文的一次分析，可包含多个方法、指标、缺陷和个人笔记。

本数据契约现已接入本地 JSON 导入、文献详情页和 Matrix。导入操作、存储边界、手动验收及文件清单见 [IMPORT.md](IMPORT.md)。PDF 解析与 AI 调用仍未接入。

## 文件与校验

| 文件 | 用途 |
| --- | --- |
| `schema/paper-analysis.schema.json` | JSON Schema Draft 2020-12，单一数据契约来源 |
| `results/paper-analysis.example.json` | 虚构论文的完整示例，演示多条分析、证据、页码和不同来源 |
| `scripts/validation.mjs` | 本地 Schema 自检、结构校验和跨字段校验 |
| `scripts/validate-analysis.mjs` | 命令行入口，只读取文件并输出结果 |
| `../tests/analysis.test.mjs` | 正例、反例和非破坏性校验测试 |

在项目根目录执行：

```powershell
npm run validate:analysis
npm run test:analysis
```

第一个命令先自检 Schema，再校验 `analysis/results/` 中的所有 `.json` 文件，也支持指定文件：

```powershell
npm run validate:analysis -- analysis/results/paper-analysis.example.json
```

命令成功退出码为 `0`；JSON 语法、结构、语义或读取失败时为非 `0`，并显示字段路径。接受 UTF-8 BOM，限制单个文件不超过 5 MiB；不会改写输入文件。Ajv 与 ajv-formats 现在是浏览器导入校验所需的运行依赖，命令行和浏览器共用 `shared/validation-core.mjs`。

`$id` 是稳定的 Schema 标识符，不代表已部署的网络地址；所有 `$ref` 均指向本文件的 `$defs`。示例的 `$schema` 是供编辑器使用的相对路径。校验器固定使用项目本地 Schema，不从输入 JSON 指定的地址加载外部代码或 Schema。

## 接入前的兼容基线

设计该契约时，原项目的数据结构如下；它们构成兼容映射的基线。当前实现已新增 `PaperRecord` 仓库及契约类型，具体实现见导入说明。

| 位置 | 当前结构与行为 |
| --- | --- |
| `src/data/demo.ts` | `demoPaper` 与 `libraryPapers` 为隐式类型，`year` 和 `authors` 是字符串；`method`、`notes` 是单个字符串 |
| `src/data/demo.ts` | 已有 `Metric`：`id/name/dataset/result/baseline/description/higher`；已有 `Limitation`：`id/type/description/source/impact/improvement` |
| `src/pages/paper-detail.tsx` | 文献、指标、缺陷和笔记保存在页面 `useState` 中；方法名称、分类、步骤、创新点仍有静态展示内容 |
| `src/pages/workspace-pages.tsx` | Literature Matrix 为静态行对象：`name/year/method/task/dataset/result/limitation/tag` |
| `src/theme/themes.ts`、`theme-provider.tsx` | 唯一现有 localStorage 键为 `researchflow-theme`，只保存主题选择 |

这些旧记录作为 legacy 数据保留。仓库启动时只读；首次成功保存后一起保存原有记录，不覆盖主题或用户可能已有的其他存储键。

## 文档结构

```text
PaperAnalysis
  schemaVersion, analysisId, isExample
  paper                     文献基本信息
  sourceDocument            来源文件信息，未知时为 null
  analysis
    methods[]               多个方法
    metrics[]               多个指标
    limitations[]           多个缺陷 / 局限性
  notes[]                   个人笔记，独立于分析结论
  provenance                谁整理了这份分析
  createdAt, updatedAt      带时区的 ISO 日期时间
```

| 顶层字段 | 约定 |
| --- | --- |
| `schemaVersion` | 固定为 `1.0.0`；不兼容版本必须先显式转换，不能直接套用 |
| `analysisId` | 分析记录的稳定 ID；同一篇论文可有多个分析版本，避免用论文 ID 覆盖历次分析 |
| `isExample` | 必填布尔值；`provenance.kind=example` 时必须为 `true` |
| `paper.id` | 对应现有文献 ID；已有论文 ID 不随标题或 DOI 修改而重建 |
| `sourceDocument` | `fileName/sha256/pageCount/url`；未计算哈希、未知页数或链接用 `null`，无来源文件时整个对象可为 `null` |
| `analysis` | 三个数组必须存在，尚未分析时可为 `[]`，不以虚构内容填满 |
| `notes` | 必填数组，允许为空；笔记正文是 `content`，格式为 `plain_text` 或 `markdown` |
| `provenance` | `kind` 为 `human/ai/legacy_import/example`；记录整理方式，不代表结论是否来自作者 |

核心对象拒绝未知属性，以便尽早发现拼写错误。Schema 不自动补默认值、转换类型或删除未知字段。未知字段如需正式支持，应修改版本和兼容策略，而不是悄悄丢弃。

所有方法、指标、缺陷、笔记以及内嵌证据的 ID 在一份文档中必须唯一；不同分析文档中的 ID 可重复。建议使用 UUID 或带类别前缀的稳定 ID，长度不超过 128 个字符。

## 方法、指标和缺陷

三个分析数组的每个条目都包含 `id`、`evidence[]` 和 `verification`。

| 类别 | 专有字段 |
| --- | --- |
| `methods[]` | `name` 方法名称、`category` 分类、`principle` 核心原理、`steps[]` 实现步骤、`innovations[]` 创新点 |
| `metrics[]` | 复用现有 `name/dataset/result/baseline/description/higher`，可选 `task`；`higher=true` 越高越好，`false` 越低越好 |
| `limitations[]` | `description` 缺陷描述、`sourceType` 来源类型、`source` 来源说明、`impact` 影响、`improvement` 改进方向、`reasoning` 推断理由 |

`result` 和 `baseline` 保持字符串，可表达 `28.4`、`120 ms`、置信区间或科学记数法。没有对比基线时 `baseline` 为 `""`；不要用 `0` 代替未知结果。

方法与指标都是论文级集合，本版本没有规定某个指标只属于某个方法，不能按数组下标强行配对。未来需要方法到实验的精确关联时，再版本化增加关联 ID 并验证引用完整性。

## 原文证据与页码

每个 `evidence[]` 成员包含：

| 字段 | 约定 |
| --- | --- |
| `id` | 证据记录 ID |
| `quote` | 原文逐字摘录；总结、翻译和 AI 推理不能假装成逐字引文 |
| `relation` | `direct_support`：直接支持当前陈述；`context`：仅提供推断上下文 |
| `location.pdfPage` | PDF 文件的物理页码，从 **1** 开始，未知为 `null` |
| `location.printedPage` | 论文印刷页码字符串，可为 `ii`、`S3`，未知为 `null` |
| `location.section` | 章节名称，未知为 `null` |
| `location.locator` | 表格、图、公式或段落位置，未知为 `null` |
| `verification` | 对这条引文及其位置的独立核验记录 |

PDF 物理页码与印刷页码可能不同，应分别记录。页码未知时不能写 `0` 或猜测页码。没有任何原文证据时允许 `evidence: []`，但该条目不能标为 `verified`；作者明确提出的局限性还受下节的约束。

所有证据均指向本份分析的 `sourceDocument`。如果来源文件未知，仍可暂存待核验引文；以后取得文件并核对前不能把结构校验当作证据真实性确认。未来引用另一篇论文的材料应另建来源文档关系，不能混用当前论文的页码。

## 来源类别与人工核验是两个维度

| `sourceType` | 意义与强制规则 |
| --- | --- |
| `author_stated` | 作者明确提出的局限性；至少一条 `direct_support` 原文证据，`reasoning` 必须为 `null` |
| `ai_inferred` | AI 根据上下文推断的缺陷；必须有非空 `reasoning`，所有证据只能是 `context`；没有证据时保留空数组和未核验状态 |
| `reader_inferred` | 读者个人推断；与 AI 推断分别标注，同样需要推断理由，证据只能作为 `context` |

`provenance.kind=ai` 与 `sourceType=ai_inferred` 不等价。AI 可以整理作者明确写出的局限性，此时来源仍为 `author_stated`，但引文仍须核验。模型输出新的假设时必须用 `ai_inferred`。真实 AI 整理记录要求填写 `provenance.model`；本阶段的示例为 `kind=example`，没有实际模型调用。

| `verification.status` | 意义 |
| --- | --- |
| `unverified` | 尚未核验，通常 `reviewedBy/reviewedAt` 为 `null` |
| `needs_review` | 需要复核，例如表格数值、数据集或推断依据尚不确定 |
| `verified` | 已人工检查当前记录及其证据，必须填写核验人和时间 |
| `rejected` | 经检查不成立或记录错误，同样必须填写核验人和时间，可在 `note` 解释 |

条目和证据分别核验：条目标为 `verified` 时至少要有一条证据，且其所有证据都必须为 `verified`；每条已核验证据必须有 PDF 物理页码或印刷页码。原文引用准确仍不等于整项分析正确，因此允许“证据已核验、条目待复核”，不允许反向自动升级。

人工复核过的 AI 推断仍然是 `ai_inferred`，不能因此改成作者承认的局限性。核验记录仅表达有人检查过该描述、引用和推理，不是科学结论的自动认证。

**校验器不能判断引文是否真实、是否支持结论，也不能证明核验人确实执行过核验。** `verified` 只是有结构约束的数据声明。未来导入外部 JSON 时必须把这些声明视为未受信信息，不能直接获得本地人工核验权限。

## 与现有 Paper、Note、Matrix 的兼容映射

当前适配器遵循以下映射约定；没有给缺少证据的旧示例伪造引文或页码。

| 现有字段 | 新结构 | 兼容处理 |
| --- | --- | --- |
| `demoPaper.id/title/authors/fullAuthors/year/venue/shortVenue/doi/keywords/summary` | `paper` 同名字段 | 保留名称；年份和作者展示名继续使用字符串；未知年份用 `""` |
| `demoPaper.method` | `analysis.methods[].principle` | 旧值作为单条方法原理保留；名称、分类和创新点须从已有展示信息或人工补充，不凭空生成证据 |
| `methodSteps` | `analysis.methods[].steps` | 保留步骤顺序；不要把多个方法压成一个方法 |
| `Metric` 的全部现有字段 | `analysis.metrics[]` 同名字段 | 增加 `evidence`、`verification`，不把 `result` 或 `baseline` 强制转成数字 |
| `Limitation.description/source/impact/improvement` | `analysis.limitations[]` 同名字段 | `source` 只是来源说明，不能直接充当 `quote` |
| `Limitation.type=阅读推断/个人分析` | `sourceType=reader_inferred` | 不能误标为 `ai_inferred`；需要补充 `reasoning`，证据未知保留空数组 |
| `demoPaper.notes` | `notes[].content`、`format=plain_text` | 原字符串及换行完整保留为一条笔记；未来导入默认不覆盖个人笔记 |
| 阅读状态、评分、阅读日期、关联项目 | 保留在应用自己的 Paper/阅读记录中 | 它们是个人管理信息，不属于外部分析契约，不由分析导入改写 |
| `Matrix.name/year/tag` | `paper.title/year/keywords` 的展示投影 | 只读派生；多标签展示策略由 UI 决定 |
| `Matrix.method/task/dataset/result/limitation` | 方法、指标、研究任务和缺陷的展示投影 | 同一篇论文的多条记录都保留；筛选或折叠用于展示，不能删掉其余数据 |

如果旧记录缺少新契约必需的信息，先保留原始记录，等待人工补充，不为了通过校验而编造引文、填假页码或改变来源。对旧的“作者指出”标签也不能盲目信任，必须取得明确的逐字证据。

Matrix 不是第二份事实来源，不向分析文件写回简化后的表格字符串。未来适配器应保留条目 ID，让表格中的方法、结果和缺陷能回溯到各自证据；AI 推断与未核验内容必须有可见标记。

## 校验层次与版本演进

Schema 负责对象形状、字段类型、枚举、非空文本、页码范围、日期格式及证据/核验条件。

`validation.mjs` 额外负责标准 Schema 难以表达的三个规则：

1. 一份文档内分析条目、证据与笔记的 ID 不重复。
2. 已知总页数时，证据物理页码不能越界。
3. 文档和笔记的 `updatedAt` 不早于 `createdAt`。

这两层通过仍不能证明内容真实，也不能发现导入文件与本地旧记录之间的冲突。后者属于未来导入流程。Schema 校验不执行日期/ID修复，不写 localStorage。

新增字段应更新 Schema、示例、文档与测试；不兼容改动增加主版本，并提供显式迁移器。v1.0.0 不接受其他版本，也不把未知字段自动裁掉。TypeScript 类型以后应从 Schema 生成或有一致性检查，避免维护两套分叉的数据契约。

## JSON 导入实现约定

1. **先建立兼容存储层。** 当前文献仍是页面状态。新增统一的 Paper/Note/分析仓库接口，分析可以使用独立键 `researchflow-paper-analyses-v1`；不要改动 `researchflow-theme` 或清空未知键。先备份旧数据，再考虑显式迁移。
2. **读取与完整校验。** 文件大小限制为 5 MiB，UTF-8/BOM 处理后 `JSON.parse`。固定使用本地受信 Schema，执行上述结构和语义校验，并把错误路径映射到预览界面；未知版本进入迁移提示。
3. **预览与身份匹配。** 展示论文信息、来源类别、证据页码、方法/指标/缺陷数量及示例标记。先匹配已有 `paper.id`，再辅助检查 DOI；同 ID 但信息不一致时显示冲突。不能按标题自动覆盖，也不能静默载入虚构样例为真实结论。
4. **保留来源与核验历史。** 外部传入的 `verified/rejected` 只作为原文件中的声明保存在导入审计记录中；新导入的本地条目及证据默认 `unverified`，再由用户在核验界面明确确认。来源类别原样保留，不能把 AI 推断变成作者结论。
5. **明确合并策略。** 默认新增一份分析版本；同一 `analysisId` 或条目 ID 冲突时让用户选择跳过、保留两版或明确替换。个人笔记默认保留，追加也应明确选择。保留完整原 JSON 和操作前快照以便撤销，不把删减后的 Matrix 行当作存储。
6. **成功写入后更新界面。** 将最终数据组装成完整候选快照，单次写入对应新键；捕获配额或存储权限错误，失败时保留旧状态并显示错误，不能先在 UI 宣称成功。刷新后应能恢复。
7. **接入详情页与 Matrix。** 在保持主题与布局的前提下渲染多个方法、指标和缺陷，提供原文定位、来源标签和核验状态。Matrix 从相同仓库派生，避免两份数据不一致。
8. **验收。** 覆盖合法/非法文件、版本错误、重复 ID、同论文冲突、示例警示、笔记保留、外部核验状态降级、存储失败、刷新恢复和撤销；通过后再考虑 PDF 或 AI 的独立阶段。

导入、预览编辑、版本保留与存储已按上述约定实现；当前统一重置外部核验声明，正式人工核验界面仍属于后续阶段。操作与验收详见 [IMPORT.md](IMPORT.md)。

规范参考：[JSON Schema 2020-12](https://json-schema.org/specification)、[Ajv Draft 2020-12 支持](https://ajv.js.org/json-schema)、[Ajv 格式校验](https://ajv.js.org/guide/formats)。
