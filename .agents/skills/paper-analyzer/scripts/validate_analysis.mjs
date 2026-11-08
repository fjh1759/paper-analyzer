#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, mkdirSync, existsSync, writeFileSync, unlinkSync, statSync } from 'node:fs'
import { dirname, resolve, relative, isAbsolute, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { schema, validateAnalysis } from '../../../../analysis/scripts/validation.mjs'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const MAX_BYTES = 5 * 1024 * 1024
const schemaPath = resolve(ROOT, 'analysis/schema/paper-analysis.schema.json')
const cacheRoot = resolve(ROOT, '.qa/paper-analyzer')
const resultsRoot = resolve(ROOT, 'analysis/results')
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const localPath = (value) => isAbsolute(value) ? resolve(value) : resolve(ROOT, value)

function inside(root, path) {
  const suffix = relative(root, path)
  return suffix !== '..' && !suffix.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(suffix)
}
function readJson(path) {
  if (statSync(path).size > MAX_BYTES) throw new Error('JSON exceeds the ResearchFlow 5 MiB limit')
  return JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, ''))
}

export function checkGeneratedAnalysis(document, expectedSource) {
  const result = validateAnalysis(document)
  if (!result.valid) return { ...result, warnings: [] }
  const errors = []
  const warnings = []
  const add = (path, message) => errors.push({ path, message })
  if (document.provenance.kind !== 'ai') add('/provenance/kind', 'Codex-generated analysis must disclose kind=ai')
  if (!document.sourceDocument) add('/sourceDocument', 'A real PDF analysis must retain source document identity')
  else {
    for (const field of ['fileName', 'sha256', 'pageCount']) if (document.sourceDocument[field] !== expectedSource[field]) add(`/sourceDocument/${field}`, 'Source does not match the prepared PDF')
  }
  for (const [collection, items] of Object.entries(document.analysis)) {
    items.forEach((item, index) => {
      const checks = [{ record: item.verification, path: `/analysis/${collection}/${index}/verification` }, ...item.evidence.map((evidence, evidenceIndex) => ({ record: evidence.verification, path: `/analysis/${collection}/${index}/evidence/${evidenceIndex}/verification` }))]
      for (const { record, path } of checks) {
        if (!['unverified', 'needs_review'].includes(record.status)) add(path + '/status', 'AI output cannot claim human verification or human rejection')
        if (record.reviewedBy !== null || record.reviewedAt !== null) add(path, 'AI output must leave reviewedBy and reviewedAt null')
      }
    })
  }
  if (/unknown|unreported|未提供|未知/i.test(document.provenance.model ?? '')) warnings.push('Exact model ID is not available; keep this uncertainty in the Chinese summary.')
  if (document.isExample) warnings.push('This output is marked as example data; it is not a real-paper result.')
  return { valid: errors.length === 0, errors, warnings }
}

export function publishNewBundle(directory, resultFile, summaryFile, document, summary) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(resultFile) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.summary\.md$/.test(summaryFile)) throw new Error('Invalid output filename')
  const jsonPath = resolve(directory, resultFile)
  const summaryPath = resolve(directory, summaryFile)
  if (!inside(resolve(directory), jsonPath) || !inside(resolve(directory), summaryPath)) throw new Error('Output must stay in its designated directory')
  const serialized = JSON.stringify(document, null, 2) + '\n'
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BYTES) throw new Error('Formatted output exceeds the ResearchFlow 5 MiB limit')
  if (!summary.trim()) throw new Error('Chinese summary is missing; do not publish an incomplete bundle')
  if (existsSync(jsonPath) || existsSync(summaryPath)) throw new Error('Output already exists; prepare a new run instead of overwriting it')
  mkdirSync(directory, { recursive: true })
  // Exclusive creation; if the second write fails, remove only the file this call created.
  writeFileSync(summaryPath, summary, { encoding: 'utf8', flag: 'wx' })
  try { writeFileSync(jsonPath, serialized, { encoding: 'utf8', flag: 'wx' }) }
  catch (error) { unlinkSync(summaryPath); throw error }
  return { json: jsonPath, summary: summaryPath }
}

function loadSourceManifest(path) {
  if (basename(path) !== 'manifest.json' || !inside(cacheRoot, realpathSync(path))) throw new Error('Use a source manifest created inside .qa/paper-analyzer/')
  const manifest = readJson(path)
  if (manifest.manifestVersion !== 1 || !manifest.sourceDocument || !Number.isInteger(manifest.sourceDocument.pageCount) || manifest.sourceDocument.pageCount < 1) throw new Error('Invalid source manifest')
  if (manifest.schemaSha256 !== digest(schemaPath)) throw new Error('Schema changed since extraction; read the current contract and prepare a new run')
  const pdf = localPath(manifest.inputPdf)
  if (basename(pdf) !== manifest.sourceDocument.fileName || digest(pdf) !== manifest.sourceDocument.sha256) throw new Error('Source PDF changed or does not match the manifest')
  return manifest
}

function printErrors(result) { result.errors.forEach((error) => console.error(`${error.path}: ${error.message}${error.details ? ' ' + JSON.stringify(error.details) : ''}`)) }

export function main(args = process.argv.slice(2)) {
  try {
    const { values } = parseArgs({ args, options: { fixture: { type: 'string' }, draft: { type: 'string' }, manifest: { type: 'string' }, publish: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h' } }, allowPositionals: false })
    if (values.help) {
      console.log('Fixture-only check (no publication):\n  node validate_analysis.mjs --fixture analysis/results/paper-analysis.example.json\nGenerated analysis check/publication:\n  node validate_analysis.mjs --draft <draft.json> --manifest <manifest.json> [--publish]')
      return 0
    }
    if (values.fixture) {
      if (values.draft || values.manifest || values.publish) throw new Error('--fixture cannot be combined with generated-paper publication options')
      const fixture = readJson(localPath(values.fixture))
      const checked = validateAnalysis(fixture)
      if (!checked.valid) { printErrors(checked); return 1 }
      console.log(`PASS: ${schema.title}; Schema and cross-field fixture checks only. No PDF analyzed and no output published.`)
      return 0
    }
    if (!values.draft || !values.manifest) throw new Error('Provide --draft and --manifest, or use --fixture / --help')
    const manifestPath = localPath(values.manifest)
    const manifest = loadSourceManifest(manifestPath)
    const draftPath = localPath(values.draft)
    if (draftPath !== resolve(dirname(manifestPath), 'draft.json') || !inside(cacheRoot, realpathSync(draftPath))) throw new Error('Use this manifest run\'s draft.json')
    const document = readJson(draftPath)
    const checked = checkGeneratedAnalysis(document, manifest.sourceDocument)
    if (!checked.valid) { printErrors(checked); return 1 }
    checked.warnings.forEach((warning) => console.log('REVIEW: ' + warning))
    console.log('PASS: Schema, cross-field consistency, source identity and AI verification-state constraints. This is not human factual verification.')
    if (values.publish) {
      if (!inside(realpathSync(ROOT), realpathSync(dirname(resultsRoot)))) throw new Error('Analysis directory resolves outside the project')
      if (existsSync(resultsRoot) && !inside(realpathSync(ROOT), realpathSync(resultsRoot))) throw new Error('Results directory resolves outside the project')
      const summary = readFileSync(resolve(dirname(manifestPath), 'summary.md'), 'utf8')
      const published = publishNewBundle(resultsRoot, manifest.resultFile, manifest.summaryFile, document, summary)
      console.log(JSON.stringify(published, null, 2))
    }
    return 0
  } catch (error) {
    console.error('ERROR: ' + error.message)
    return 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main()
