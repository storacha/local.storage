#!/usr/bin/env node
import fs from 'fs'
import sade from 'sade'
import * as Link from 'multiformats/link'
import { get, entries } from '@web3-storage/pail'
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
  .option('--json', 'Format output as newline delimted JSON.')
  .action(async (opts) => {
    const blocks = new BlockStore(`${opts.path}/blocks`)
    const root = Link.decode(fs.readFileSync(`${opts.path}/root`))
    console.log(`Reading pail with root: ${root}`)
    let n = 0
    // @ts-expect-error
    for await (const [k, v] of entries(blocks, root, { prefix: opts.prefix })) {
      console.log(opts.json ? JSON.stringify({ key: k, value: v.toString() }) : `${k}\t${v}`)
      n++
    }
    if (!opts.json) console.log(`total ${n}`)
  })

cli.parse(process.argv)
