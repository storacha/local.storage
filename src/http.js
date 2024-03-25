import * as API from './api.js'
import httpRangeParse from 'http-range-parse'

/**
 * Convert a HTTP Range header to a range object.
 * @param {string} value
 * @returns {API.Range}
 */
export const parseRange = value => {
  const result = httpRangeParse(value)
  if (result.ranges) throw new Error('Multipart ranges not supported')
  const { unit, first, last, suffix } = result
  if (unit !== 'bytes') throw new Error(`Unsupported range unit: ${unit}`)
  return suffix != null
    ? { suffix }
    : { offset: first, length: last != null ? last - first + 1 : undefined }
}
