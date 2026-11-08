import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { schema, validateAnalysis } from '../analysis/scripts/validation.mjs'

const example = JSON.parse(readFileSync(new URL('../analysis/results/paper-analysis.example.json', import.meta.url), 'utf8'))
const unverified = () => ({ status: 'unverified', reviewedBy: null, reviewedAt: null, note: '' })
const verified = () => ({ status: 'verified', reviewedBy: '测试核验人', reviewedAt: '2026-10-31T02:00:00Z', note: '仅测试' })

test('Schema 编译、示例及 JSON 往返均通过；多条方法、指标、缺陷与来源得到保留', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.deepEqual(validateAnalysis(example), { valid: true, errors: [] })
  assert.deepEqual(validateAnalysis(JSON.parse(JSON.stringify(example))), { valid: true, errors: [] })
  assert.ok(example.analysis.methods.length > 1)
  assert.ok(example.analysis.metrics.length > 1)
  assert.deepEqual(new Set(example.analysis.limitations.map((item) => item.sourceType)), new Set(['author_stated', 'ai_inferred', 'reader_inferred']))
})

test('未完成分析允许空数组；未知文档和未知页码不需伪造', () => {
  const document = structuredClone(example)
  document.sourceDocument = null
  document.analysis = { methods: [], metrics: [], limitations: [] }
  document.notes = []
  assert.equal(validateAnalysis(document).valid, true)
  const draft = structuredClone(example)
  draft.analysis.methods[1].evidence[0].location = { pdfPage: null, printedPage: null, section: '待定位章节', locator: null }
  assert.equal(validateAnalysis(draft).valid, true)
})

test('通过人工复核的 AI 推断仍保留 ai_inferred，不变成作者结论', () => {
  const document = structuredClone(example)
  const item = document.analysis.limitations[1]
  item.verification = verified()
  item.evidence[0].verification = verified()
  assert.equal(validateAnalysis(document).valid, true)
  assert.equal(item.sourceType, 'ai_inferred')
  assert.equal(item.evidence[0].relation, 'context')
})

test('校验不填默认值、不强制转换、不删除未知字段，也不修改输入数据', () => {
  const document = structuredClone(example)
  document.unrecognized = '保留以供报错，不能被校验器悄悄删除'
  document.paper.year = 2026
  const before = JSON.stringify(document)
  assert.equal(validateAnalysis(document).valid, false)
  assert.equal(JSON.stringify(document), before)
})

const invalidCases = [
  ['不支持的版本', (doc) => { doc.schemaVersion = '2.0.0' }],
  ['缺少方法数组', (doc) => { delete doc.analysis.methods }],
  ['数字年份破坏现有字符串类型', (doc) => { doc.paper.year = 2026 }],
  ['优化方向不能使用字符串布尔值', (doc) => { doc.analysis.metrics[0].higher = 'true' }],
  ['名称不能只有空白', (doc) => { doc.analysis.methods[0].name = '  ' }],
  ['PDF 页码不能从 0 开始', (doc) => { doc.analysis.metrics[0].evidence[0].location.pdfPage = 0 }],
  ['PDF 页码必须是整数', (doc) => { doc.analysis.metrics[0].evidence[0].location.pdfPage = 1.5 }],
  ['非法核验状态', (doc) => { doc.analysis.metrics[0].verification.status = 'probably_true' }],
  ['已核验条目不能为空证据', (doc) => { doc.analysis.methods[0].evidence = [] }],
  ['已核验证据缺少核验人', (doc) => { doc.analysis.methods[0].evidence[0].verification.reviewedBy = null }],
  ['已核验结论缺少核验时间', (doc) => { doc.analysis.methods[0].verification.reviewedAt = null }],
  ['已核验证据不能缺少页码', (doc) => { const loc = doc.analysis.methods[0].evidence[0].location; loc.pdfPage = null; loc.printedPage = null }],
  ['已核验条目包含未核验证据', (doc) => { doc.analysis.methods[0].evidence[0].verification = unverified() }],
  ['作者明确提出必须有原文证据', (doc) => { doc.analysis.limitations[0].evidence = [] }],
  ['仅上下文不能当作作者明确提出', (doc) => { doc.analysis.limitations[0].evidence[0].relation = 'context' }],
  ['AI 推断必须有推理依据', (doc) => { doc.analysis.limitations[1].reasoning = null }],
  ['AI 推断不能把上下文当作直接作者断言', (doc) => { doc.analysis.limitations[1].evidence[0].relation = 'direct_support' }],
  ['不允许未知字段', (doc) => { doc.analysis.metrics[0].evalution = '拼写错误' }],
  ['非法日期时间', (doc) => { doc.updatedAt = '2026-02-30T10:00:00Z' }],
  ['AI 生成来源必须记录模型', (doc) => { doc.provenance.kind = 'ai'; doc.provenance.model = null }],
  ['示例不能伪装成真实数据', (doc) => { doc.isExample = false }],
  ['重复条目 ID 即使内容不同也拒绝', (doc) => { doc.analysis.methods[1].id = doc.analysis.methods[0].id }],
  ['跨集合的重复证据 ID', (doc) => { doc.analysis.metrics[0].evidence[0].id = doc.analysis.methods[0].evidence[0].id }],
  ['物理页码不能超过文档总页数', (doc) => { doc.analysis.metrics[0].evidence[0].location.pdfPage = 9 }],
  ['文档修改时间不能早于创建时间', (doc) => { doc.updatedAt = '2026-10-30T01:00:00Z' }],
  ['笔记修改时间不能早于创建时间', (doc) => { doc.notes[0].updatedAt = '2026-10-30T01:00:00Z' }],
]
for (const [name, mutate] of invalidCases) {
  test(`拒绝：${name}`, () => {
    const document = structuredClone(example)
    mutate(document)
    const result = validateAnalysis(document)
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
  })
}
