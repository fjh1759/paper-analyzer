import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, mkdtempSync, rmdirSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkGeneratedAnalysis, publishNewBundle, main, ROOT } from '../.agents/skills/paper-analyzer/scripts/validate_analysis.mjs'

// Existing fictional data is used ONLY for policy/format unit tests, not PDF analysis.
const original = JSON.parse(readFileSync(new URL('../analysis/results/paper-analysis.example.json', import.meta.url), 'utf8'))
function fixtureDraft() {
  const document = structuredClone(original)
  document.provenance.kind = 'ai'
  document.provenance.model = 'unknown (Codex session model ID not exposed)'
  document.sourceDocument.sha256 = 'f'.repeat(64)
  for (const items of Object.values(document.analysis)) {
    for (const item of items) {
      for (const verification of [item.verification, ...item.evidence.map((entry) => entry.verification)]) {
        verification.status = 'unverified'; verification.reviewedBy = null; verification.reviewedAt = null
      }
    }
  }
  return document
}

test('sample-only CLI validates existing Schema/cross-field fixture without publishing files', () => {
  const directory = join(ROOT, 'analysis/results')
  const before = readdirSync(directory)
  assert.equal(main(['--fixture', 'analysis/results/paper-analysis.example.json']), 0)
  assert.deepEqual(readdirSync(directory), before)
  assert.equal(main(['--fixture', 'analysis/results/paper-analysis.example.json', '--publish']), 1)
  assert.deepEqual(readdirSync(directory), before)
})

test('fixture policy checks allow uncertain states without inventing a model identifier', () => {
  const document = fixtureDraft()
  document.analysis.metrics[0].verification.status = 'needs_review'
  const checked = checkGeneratedAnalysis(document, document.sourceDocument)
  assert.equal(checked.valid, true)
  assert.ok(checked.warnings.some((warning) => warning.includes('model ID')))
  assert.equal(document.analysis.limitations[1].sourceType, 'ai_inferred')
})

test('generated analysis cannot claim verified/rejected human decisions', () => {
  for (const status of ['verified', 'rejected']) {
    const document = fixtureDraft()
    const verification = { status, reviewedBy: 'test-only reviewer', reviewedAt: '2026-10-31T02:00:00Z', note: 'unit test' }
    document.analysis.methods[0].verification = verification
    document.analysis.methods[0].evidence[0].verification = { ...verification }
    const checked = checkGeneratedAnalysis(document, document.sourceDocument)
    assert.equal(checked.valid, false)
    assert.ok(checked.errors.some((error) => error.message.includes('human verification')))
  }
})

test('AI output cannot forge reviewer metadata even when marked unverified', () => {
  const document = fixtureDraft()
  document.analysis.metrics[0].verification.reviewedBy = 'invented reviewer'
  assert.equal(checkGeneratedAnalysis(document, document.sourceDocument).valid, false)
})

test('generator must disclose AI origin and retain the prepared source identity', () => {
  const document = fixtureDraft()
  const expected = structuredClone(document.sourceDocument)
  document.provenance.kind = 'human'
  assert.equal(checkGeneratedAnalysis(document, expected).valid, false)
  for (const [field, changed] of [['fileName', 'another.pdf'], ['sha256', 'a'.repeat(64)], ['pageCount', 9]]) {
    const draft = fixtureDraft(); draft.sourceDocument[field] = changed
    const result = checkGeneratedAnalysis(draft, expected)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some((error) => error.path === `/sourceDocument/${field}`))
  }
  const draft = fixtureDraft(); draft.sourceDocument = null
  assert.equal(checkGeneratedAnalysis(draft, expected).valid, false)
})

test('original Schema and cross-field restrictions are still enforced by the skill', () => {
  const document = fixtureDraft()
  document.analysis.methods[1].id = document.analysis.methods[0].id
  assert.equal(checkGeneratedAnalysis(document, document.sourceDocument).valid, false)
  const another = fixtureDraft(); another.background = 'Unsupported top-level field'
  assert.equal(checkGeneratedAnalysis(another, another.sourceDocument).valid, false)
})

test('publisher creates a new bundle only, never overwrites and refuses path traversal', () => {
  const directory = mkdtempSync(join(tmpdir(), 'paper-analyzer-unit-'))
  try {
    const document = fixtureDraft()
    const result = publishNewBundle(directory, 'fixture.json', 'fixture.summary.md', document, '仅工具单元测试，不是实际论文分析。')
    assert.deepEqual(JSON.parse(readFileSync(result.json, 'utf8')), document)
    assert.throws(() => publishNewBundle(directory, 'fixture.json', 'fixture.summary.md', { changed: true }, 'changed'), /already exists/)
    assert.deepEqual(JSON.parse(readFileSync(result.json, 'utf8')), document)
    assert.throws(() => publishNewBundle(directory, '../escape.json', 'escape.summary.md', document, 'unit test'), /filename/)
    assert.throws(() => publishNewBundle(directory, 'empty.json', 'empty.summary.md', document, '  '), /summary/)
    assert.equal(existsSync(join(directory, 'empty.json')), false)
  } finally {
    for (const name of ['fixture.json', 'fixture.summary.md']) {
      const path = join(directory, name)
      if (existsSync(path)) unlinkSync(path)
    }
    rmdirSync(directory)
  }
})

test('formatted oversized output is rejected before any bundle file is created', () => {
  const directory = mkdtempSync(join(tmpdir(), 'paper-analyzer-unit-'))
  try {
    assert.throws(() => publishNewBundle(directory, 'large.json', 'large.summary.md', { text: '字'.repeat(2 * 1024 * 1024) }, 'unit test'), /5 MiB/)
    assert.deepEqual(readdirSync(directory), [])
  } finally { rmdirSync(directory) }
})
