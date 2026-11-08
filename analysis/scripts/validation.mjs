import { readFileSync } from 'node:fs'
import { createAnalysisValidator } from '../shared/validation-core.mjs'

export const schema = JSON.parse(readFileSync(new URL('../schema/paper-analysis.schema.json', import.meta.url), 'utf8'))
export const validateAnalysis = createAnalysisValidator(schema)
