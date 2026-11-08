import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

// 浏览器与 Node 共用同一份校验规则，无 I/O、存储写入或数据修复。
export function createAnalysisValidator(schema) {
const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: true, coerceTypes: false, useDefaults: false, removeAdditional: false })
addFormats(ajv)
if (!ajv.validateSchema(schema)) throw new Error(`Schema 自检失败：${ajv.errorsText(ajv.errors)}`)
const validateStructure = ajv.compile(schema)

return function validateAnalysis(document) {
  if (!validateStructure(document)) {
    return { valid: false, errors: validateStructure.errors.map(({ instancePath, message, params }) => ({ path: instancePath || '/', message, details: params })) }
  }

  // 标准 JSON Schema 无法按对象的 id 唯一性、跨字段日期大小或总页数比较。
  const errors = []
  const seenIds = new Map()
  function addError(path, message) { errors.push({ path, message }) }
  function checkId(id, path) {
    if (seenIds.has(id)) addError(path, `重复 ID：${id}；首次出现于 ${seenIds.get(id)}`)
    else seenIds.set(id, path)
  }
  function checkDates(record, path) {
    if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) addError(`${path}/updatedAt`, 'updatedAt 不能早于 createdAt')
  }
  checkDates(document, '')
  const pageCount = document.sourceDocument?.pageCount
  for (const collection of ['methods', 'metrics', 'limitations']) {
    document.analysis[collection].forEach((item, index) => {
      const path = `/analysis/${collection}/${index}`
      checkId(item.id, `${path}/id`)
      item.evidence.forEach((evidence, evidenceIndex) => {
        const evidencePath = `${path}/evidence/${evidenceIndex}`
        checkId(evidence.id, `${evidencePath}/id`)
        if (pageCount !== null && pageCount !== undefined && evidence.location.pdfPage !== null && evidence.location.pdfPage > pageCount) {
          addError(`${evidencePath}/location/pdfPage`, `PDF 物理页码不能超过文档总页数 ${pageCount}`)
        }
      })
    })
  }
  document.notes.forEach((note, index) => {
    checkId(note.id, `/notes/${index}/id`)
    checkDates(note, `/notes/${index}`)
  })
  return { valid: errors.length === 0, errors }
}

}
