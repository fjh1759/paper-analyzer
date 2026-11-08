# ResearchFlow 1.0.0 字段映射

先读项目当前 [Schema](../../../../analysis/schema/paper-analysis.schema.json)；本文件是映射指导，不是第二套 Schema。

| 用户需要的内容 | 现有字段 | 记录方式 |
| --- | --- | --- |
| 标题、作者、年份、DOI | `paper.title/authors/fullAuthors/year/doi/venue` | 年份保持字符串；未知年份为 `""`，未知 DOI 留空或省略，不从文件名猜作者或年份 |
| 背景、目的、核心问题 | `paper.summary` 与 `notes[].content` | Schema 没有这些独立字段；摘要概述，生成笔记用中文分段，写明事实或 AI 解读及页码 |
| 方法名称、分类、原理、步骤、创新点 | `analysis.methods[]` | 对应 `name/category/principle/steps[]/innovations[]`；创新点标明是作者主张还是 AI 解读 |
| 指标名称、定义、数据集、数值、基线、方向 | `analysis.metrics[]` | 定义、单位、评估协议放 `description`；`result/baseline` 保留字符串及单位；`higher` 只能是真/假，不能用未知值凑数 |
| 实验结果、主要结论、适用范围 | `metrics[]` 与 `notes[].content` | Schema 没有独立 conclusions 字段；分开作者报告的结果和 AI 对结果的解释，不把跨任务结果混作同一比较 |
| 作者明确承认的局限 | `limitations[].sourceType=author_stated` | `reasoning=null`，至少一条 `relation=direct_support` 的逐字原文；未发现时不捏造 |
| AI 潜在缺陷 | `limitations[].sourceType=ai_inferred` | `reasoning` 写出逻辑和不确定性，引用关系只用 `context`；这不是作者原话 |
| 个人读者推断 | `sourceType=reader_inferred` | 仅当实际来自用户的个人观点时使用；不能把 Codex 新生成的判断归给用户 |
| 改进方向、未来问题 | `limitations[].improvement` 与 `notes[].content` | 区分作者未来工作与 AI 建议，尚无对应缺陷的未来问题放生成笔记 |
| 原文证据与页码 | 条目 `evidence[]` | `quote` 逐字摘录；`location` 中分别填写 `pdfPage/printedPage/section/locator` |
| 公式、图、表读取失败及分析缺口 | `notes[].content`、核验 `note`、中文总结 | Schema 没有结构化 readability/formulas 字段；准确列出物理页码及编号，不能新增不支持字段 |

## 证据与推断

- `quote` 只放原文可准确识别的文本。解释、翻译、摘录后的推理分别放相应分析字段；不要把连写多个远隔段落的拼接内容当作一段逐字原文。
- 引文覆盖当前条目的哪些事实应能从章节/表格定位看出。Schema 没有逐字段证据关联；细粒度差异需写在生成笔记中，不增设 `fieldEvidence` 等未知属性。
- 作者局限条目的 `sourceType` 只描述缺陷本身的来源。其影响或改进若是 Codex 推断，分别在 `impact/improvement` 开头标注“AI 推断/建议，待核验”，不能暗示作者明确说过这些补充。
- 结果必须核对任务、数据划分、样本/单位、模型变体及表头。不要把验证集当测试集，或把相邻列基线与本方法颠倒。不清楚的地方放核验清单。
- 不把参考文献中的结果误记为本论文的结果。对引用文献只保留本 PDF 实际写出的标识；没有读过引用文献就不能伪造其原文证据或页码。
- 不默认联网补充 DOI 或下载其他版本。用户要求外部核对时，另行注明来源和版本；外部内容不能假装来自当前 PDF。

## 缺失信息与类型边界

三个分析数组允许为空。方法条目要求名称、分类、原理、非空步骤与创新点列表；指标条目要求非空名称、数据集、结果及确定的 `higher`。不能诚实填全时，保留已知事实于生成笔记，并说明尚未结构化的原因。

`paper.venue` 可以为空，年份允许 `""`，DOI 可以空或省略。若作者无法识别，可用明确的“未识别（待人工核验）”标记；若连论文身份或主要内容都不可读，应报告读取失败，不生成空壳论文。未知数据不能填 0，未知页码不能填 0。

所有条目和证据的 `verification.status` 仅为 `unverified` 或 `needs_review`，核验人/时间为 `null`。不得依据“我看过图片”或“Schema 校验通过”标为 `verified`，也不能伪造人工否定记录 `rejected`。

## 随附笔记与输出

生成笔记建议按实际阅读内容组织为：研究背景与核心问题、实验结论及适用范围、未来研究问题、读取限制与人工核验清单。每段写明事实/作者观点/AI 推断；页码未知就明确写未知。

每个 `notes[]` 成员有独立 ID、`format=markdown` 或 `plain_text`、真实 `createdAt/updatedAt`。内容以“AI 生成分析笔记，尚未人工核验”开头，不混入或覆盖用户已有笔记。导入器保留文件随附笔记，默认不追加到个人阅读笔记。

`sourceDocument` 使用准备脚本给出的 PDF 文件名、SHA-256 和物理总页数，`url` 无可靠来源时为 `null`。不要把 PDF 元数据标签未经确认填入印刷页码。

每次分析使用新的 `analysisId` 和输出文件名；修改重试只改缓存草稿。输出不超过导入器的 5 MiB 上限。发布器使用项目现有校验器，不删除未知字段或放宽类型约束；遇到 Schema 版本或哈希变化，重新读取并报告差异。
