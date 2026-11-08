# 文献分析 JSON 导入

此功能使用原有 `paper-analysis.schema.json` 的 1.0.0 契约，Schema 内容保持不变。仅从本地文件读取 JSON，不调用后端、AI 或 PDF 解析服务。

## 手动验证

在项目根目录运行 `npm run dev`，打开终端显示的地址（通常是 `http://127.0.0.1:5173/library`）。

1. 点击文献库右上方的 **导入分析结果**，选择 `analysis/results/paper-analysis.example.json`。这是明确标记的虚构测试数据。
2. 检查论文标题、作者、DOI，以及 2 个方法、2 个指标和 3 个缺陷。展开证据查看原文摘录、物理页码、印刷页码和核验声明。
3. 可直接修改标题、方法原理、实现步骤、指标结果、缺陷描述、来源类别、引文和页码。完整 JSON 编辑支持其余字段和增删条目，修改后须点击 **校验并更新预览**。非法数据会阻止保存。
4. 首次导入无匹配文献时选择新建。有 ID、DOI 或标题与年份匹配时，明确选择 **新建文献** 或 **关联现有文献，追加分析版本**，并指定目标。标题匹配只是提示，不会自动覆盖。
5. 重复的 `analysisId` 必须选择 **保留两版** 或 **跳过**。选择新建且文献 ID 已存在时，系统分配新的本地文献 ID，原文献不变。
6. 默认不把文件笔记写入个人笔记。若希望追加，勾选对应选项；原个人笔记仍完整保留。文件中的笔记无论是否追加，都会留在分析版本中。
7. 对示例文件勾选“我了解这是虚构示例数据”，再勾选目标与处理方式确认，点击 **确认导入**。任何内容修改或库更新都会取消保存确认，要求重新核对。
8. 导入成功后跳转详情页。核对多条方法、结果、来源标签与证据，所有导入条目和证据均为 **未核验**。原始 JSON 可从右侧 **下载导入原文件** 取得。
9. 刷新页面，再进入 **Literature Matrix**，确认相同分析版本的条目与结果仍存在。详情页切换分析版本后，矩阵随之同步。
10. 再次导入同一文件，选择关联刚才的文献并保留两版。两份分析都会保留，标题、作者、DOI、评分、阅读状态和项目关联不会被文件覆盖。

验证失败场景：

- 选择语法错误的 JSON，提示“JSON 格式错误”，无法确认导入。
- 选择 `{}`，提示缺失的必填字段及路径。
- 将 `schemaVersion` 改为 `9.0.0`，提示版本不兼容。
- 将证据物理页码设为 `0`、超过文档总页数，或重复条目 ID，提示校验错误。
- 修改完整 JSON 后不重新校验，确认按钮保持禁用。
- 点击取消或发生校验/存储错误，现有文献不变。
- 导入后可通过成功通知的 **撤销本次导入** 恢复导入前数据。为保护后续编辑，导入后已修改笔记或其他数据、刷新页面、其他标签页更新时，不能使用这次内存撤销。

## 数据与兼容策略

### 独立存储

所有本地文献记录、个人笔记、旧版分析字段和导入版本统一存放在独立键：

```text
researchflow-paper-analyses-v1
```

存储信封：`{ storageVersion: 1, revision, papers: PaperRecord[], versions: AnalysisVersion[] }`。

- 启动时只读存储；没有此键时在内存使用已有示例，不自动写入或迁移。
- 成功保存时以单次 `setItem` 提交完整候选快照，写入成功后才更新 React 状态。
- 不修改 `researchflow-theme`，不枚举清理未知键，不调用 `localStorage.clear()`。
- 存储配额不足或权限被禁用时，保留旧快照并显示失败。
- 损坏或未知版本的存储进入保护状态，不以示例覆盖。界面可下载该键的原始内容用于备份。
- 保存前比较原始存储快照，多标签页已更新时拒绝陈旧提交并要求重新确认；`storage` 事件同步其他标签页。
- 相同 origin 的浏览器页面共享数据。`127.0.0.1:5173` 与 `127.0.0.1:5174`、`localhost` 是不同资料库，不会互相迁移。

### Paper、Note、版本与 Matrix

`PaperRecord` 保留现有标题、作者、字符串年份、DOI、关键词、阅读笔记字符串、阅读状态、评分及项目 ID。原有方法原理、指标和缺陷保存在 legacy 字段中，不为其伪造新契约要求的证据。

导入新文献使用文件基本信息；关联旧文献时保留它的基本信息及个人记录，只追加关键词、用户明确选择追加的笔记，以及新的分析版本。

`AnalysisVersion` 独立保存本地版本 ID、目标文献 ID、原始 `analysisId` 和 `paper.id`、文件名、导入时间、原始 JSON 及重置核验状态后的完整契约文档。版本 ID 与来源 ID 分开，重复来源 ID 可以在不同版本中保留。旧分析不被删除，条目 ID 只在各份分析内部要求唯一。

外部原始文件与本地预览修订后的数据分别保留：`originalJson` 是上传文件，`document` 是用户确认后的分析。个人笔记仍兼容现有字符串展示；文件 Note 的 ID、格式和时间保留在版本内。Markdown 当前按纯文本安全展示。

详情页和 Matrix 通过 `getActiveVersion` / `projectMatrix` 从同一仓库读取，Matrix 不保存第二份简化副本，也不按数组下标配对方法与指标。切换版本不改变个人笔记和项目关联。首页、侧边栏和文献库的文献数量、标签筛选同步读取该仓库。

原有详情示例的个人笔记、关键词、阅读状态、评分、关联项目和旧指标/缺陷编辑也已接入该存储，以免切换页面再导入时丢失阅读记录。研究项目管理页仍保留原有框架，本阶段没有重做项目管理。

### 外部核验声明

保存前先通过原始 Schema 和跨字段规则，再深拷贝候选数据，将所有条目和证据的状态统一设为 `unverified`、核验人/时间设为 `null`。外部状态写入核验备注，完整声明仍保留在 `originalJson` 中。

`author_stated`、`ai_inferred`、`reader_inferred` 和生成方式原样保留。AI 推断不会因为文件声明“已核验”变成作者结论。导入成功只表示结构与一致性检查通过；本阶段没有提供将记录升级为人工已核验的操作。

### 共享校验

`analysis/shared/validation-core.mjs` 将原先 Node 校验器中的规则原样提取为无 I/O 的工厂函数；命令行和浏览器调用同一个函数。

浏览器固定加载项目自带 Schema，不按输入 `$schema` 下载外部资源。保留日期、重复 ID、总页数等全部跨字段检查。支持 UTF-8 BOM，单文件最多 5 MiB；不自动删未知字段、转换类型或修复数据。

Ajv 和 ajv-formats 因用于浏览器校验而调整为运行依赖。校验器打包为独立资源块；Schema 没有重新设计。

## 自动化检查与浏览器验收

```powershell
npm run typecheck
npm run validate:analysis
npm run test:analysis
npm run test:import
npm run test:theme
npm run build
```

导入单元测试覆盖正常/无效文件、BOM、版本错误、确认保护、DOI 匹配、文献 ID 冲突、重复分析保留、个人笔记/标签/项目/评分保留、核验状态重置、刷新恢复、Matrix 投影、配额失败、损坏存储、多标签页冲突及撤销保护。

浏览器验收使用独立的 `5174` 测试端口，未向正在使用的 `5173` 资料库写入测试数据。实测正常导入、保存前修改、无效文件阻止、重复论文追加、ID 冲突重分配、DOI 关联、笔记与项目保留、刷新恢复、版本切换同步 Matrix，以及五种主题和手机宽度。截图在忽略目录 `.qa/import/`。

## 新增与修改文件

| 类别 | 文件 |
| --- | --- |
| 新增：共享校验 | `analysis/shared/validation-core.mjs`、`analysis/shared/validation-core.d.mts` |
| 新增：契约类型与浏览器入口 | `src/analysis/types.ts`、`src/analysis/validation.ts` |
| 新增：仓库与导入逻辑 | `src/data/library-model.ts`、`src/data/import-core.ts`、`src/data/library-store.ts`、`src/data/library-context.tsx`、`src/data/library-context-value.ts` |
| 新增：导入界面 | `src/components/analysis-preview.tsx`、`src/components/import-analysis-dialog.tsx` |
| 新增：结构化详情与矩阵 | `src/pages/analysis-paper-detail.tsx`、`src/pages/analysis-matrix.tsx` |
| 新增：测试和说明 | `tests/import.test.ts`、`analysis/IMPORT.md` |
| 修改：复用同一校验器 | `analysis/scripts/validation.mjs` |
| 修改：应用接入 | `src/main.tsx`、`src/App.tsx`、`src/components/app-layout.tsx` |
| 修改：现有界面接入 | `src/components/editor-dialog.tsx`、`src/pages/paper-detail.tsx`、`src/pages/workspace-pages.tsx`、`src/index.css` |
| 修改：依赖、构建与文档 | `package.json`、`package-lock.json`、`vite.config.ts`、`README.md`、`analysis/README.md` |

未修改原始 JSON Schema、示例 JSON、设计参考图和主题定义。
