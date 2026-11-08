import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { schema, validateAnalysis } from './validation.mjs'

const resultsDirectory = fileURLToPath(new URL('../results/', import.meta.url))
const arguments_ = process.argv.slice(2)
const files = arguments_.length
  ? arguments_.map((file) => resolve(file))
  : readdirSync(resultsDirectory, { withFileTypes: true }).filter((file) => file.isFile() && file.name.endsWith('.json')).map((file) => resolve(resultsDirectory, file.name))

console.log(`Schema 自检通过：${schema.title}（Draft 2020-12）`)
if (files.length === 0) {
  console.error('没有找到待校验的 JSON 文件。')
  process.exitCode = 1
}
for (const file of files) {
  try {
    if (statSync(file).size > 5 * 1024 * 1024) throw new Error('文件超过 5 MiB 校验上限')
    // 接受 UTF-8 BOM；不写入、不修复也不覆盖源文件。
    const document = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
    const result = validateAnalysis(document)
    if (!result.valid) {
      console.error(`FAIL ${file}`)
      result.errors.forEach((error) => console.error(`  ${error.path}: ${error.message} ${error.details ? JSON.stringify(error.details) : ''}`))
      process.exitCode = 1
    } else {
      console.log(`PASS ${file}`)
      console.log(`  方法 ${document.analysis.methods.length} · 指标 ${document.analysis.metrics.length} · 缺陷 ${document.analysis.limitations.length} · 笔记 ${document.notes.length}`)
    }
  } catch (error) {
    console.error(`FAIL ${file}: ${error.message}`)
    process.exitCode = 1
  }
}
