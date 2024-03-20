/** @param {string} k */
export const mustGetEnv = k => {
  const v = process.env[k]
  if (v == null) throw new Error(`missing environment variable: ${k}`)
  return v
}
