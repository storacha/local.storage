/** @param {string} k */
export const mustGetEnv = k => {
  const v = process.env[k]
  if (v == null) throw new Error(`missing environment variable: ${k}`)
  return v
}

/** @param {ReadableStream<Uint8Array>} readable */
export const concatStream = async readable => {
  const chunks = []
  await readable.pipeTo(new WritableStream({ write: chunk => { chunks.push(chunk) } }))
  return new Uint8Array(await new Blob(chunks).arrayBuffer())
}
