# paper-analyzer
在 Codex 中分析本地科研论文 PDF，提取带原文证据和页码的方法、指标与局限性，生成可导入 ResearchFlow 的 JSON 和中文总结。

## 使用方法

克隆本仓库，在 Codex 中打开仓库根目录。用 Node.js 和 Python 3.10+ 安装运行依赖。

```powershell
npm ci
python -m pip install pypdf
```

在 Codex 中指定要分析的本地 PDF。

```text
$paper-analyzer 分析 "papers/论文文件名.pdf"
```

也可以使用 PDF 的绝对路径。通过校验后，JSON 和中文总结会写入 `analysis/results/`。在 ResearchFlow 文献库点击 **导入分析结果**，在预览中核对匹配、原文证据和冲突处理，再决定保存。

- [技能说明](.agents/skills/paper-analyzer/SKILL.md)
- [ResearchFlow JSON 数据契约](analysis/README.md)
- [虚构示例](analysis/results/paper-analysis.example.json)

## 校验样例

```powershell
node .agents/skills/paper-analyzer/scripts/validate_analysis.mjs --fixture analysis/results/paper-analysis.example.json
```

仓库包含技能、ResearchFlow 数据契约及其验证工具。`analysis/IMPORT.md` 中的界面操作在 ResearchFlow 应用内进行。

