#!/usr/bin/env node
import fs from 'fs'
import sade from 'sade'
import * as Link from 'multiformats/link'
import { get, entries } from '@web3-storage/pail'
import Table from 'cli-table3'
import { BlockStore } from './src/stores/transactional.js'

const cli = sade('pail')
  .option('--path', 'Path to data store.', './data')

cli.command('get <key>')
  .describe('Get the stored value for the given key from the pail. If the key is not found, `undefined` is returned.')
  .action(async (key, opts) => {
    const blocks = new BlockStore(`${opts.path}/blocks`)
    const root = Link.decode(fs.readFileSync(`${opts.path}/root`))
    console.log(`Reading pail with root: ${root}`)
    // @ts-expect-error
    const value = await get(blocks, root, key)
    if (value) console.log(value.toString())
  })

cli.command('ls')
  .describe('List entries in the pail.')
  .alias('list')
  .option('-p, --prefix', 'Key prefix to filter by.')
  .option('--gt', 'Filter results by keys greater than this string.')
  .option('--lt', 'Filter results by keys less than this string.')
  .option('--json', 'Format output as newline delimted JSON.')
  .action(async (opts) => {
    const blocks = new BlockStore(`${opts.path}/blocks`)
    const root = Link.decode(fs.readFileSync(`${opts.path}/root`))
    console.log(`Reading pail with root: ${root}`)
    const { columns } = process.stdout
    const keyColWidth = columns < 128
      ? Math.max(3, Math.floor(columns / 2) - 2)
      : Math.max(3, columns - 62 - 4)
    const valColWidth = columns < 128
      ? Math.max(3, Math.floor(columns / 2) - 2)
      : 62
    const table = new Table({
      head: ['Key', 'Value'],
      colWidths: [keyColWidth, valColWidth],
      wordWrap: true,
      wrapOnWordBoundary: false
    })
    let n = 0
    // @ts-expect-error
    for await (const [k, v] of entries(blocks, root, { prefix: opts.prefix, gt: opts.gt, lt: opts.lt })) {
      if (opts.json) {
        console.log(JSON.stringify({ key: k, value: v.toString() }))
      } else {
        table.push([k, v.toString()])
      }
      n++
    }
    if (!opts.json) {
      table.push([{ content: `Total: ${n.toLocaleString()}`, colSpan: 2}])
      console.log(table.toString())
    }
  })

cli.parse(process.argv)
