import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { SubTransactionalStore, TransactionalStore } from '../../src/stores/transactional.js'

const tmpDir = () => path.join(os.tmpdir(), `${Date.now()}.${Math.random()}.test.local.storage`)

/**
 * @param {(assert: import('entail').Assert, dir: string) => Promise<void>} testfn
 */
const withTmpDir = testfn => {
  return async (/** @type {import('entail').assert} */ assert) => {
    const dir = tmpDir()
    try {
      await testfn(assert, dir)
    } finally {
      await fs.promises.rm(dir, { recursive: true, maxRetries: 10 })
    }
  }
}

export const testTransactionalStore = {
  'store some things': withTmpDir(async (assert, dir) => {
    /** @type {Array<[string, any]>} */
    const items = [
      ['foo', { bar: 'baz' }],
      ['bar', 'boz']
    ]
    const store = new TransactionalStore(dir)
    await store.transact(async s => {
      for (const [k, v] of items) {
        await s.put(k, v)
      }
    })

    await store.transact(async s => {
      for (const [k, v] of items) {
        const value = await s.get(k)
        assert.deepEqual(value, v)
      }
    })
  }),

  'multiple transactions consistent data': withTmpDir(async (assert, dir) => {
    const store = new TransactionalStore(dir)
    await Promise.all([
      store.transact(async s => {
        await s.put('foo', 123)
        await s.put('bar', '🍻')
      }),
      store.transact(s => s.put('baz', {})),
      store.transact(s => s.put('boz', { test: 1138 })),
      store.transact(s => s.del('baz'))
    ])
    const items = await store.transact(async s => {
      /** @type {Array<[string, any]>} */
      const arr = []
      for await (const [k, v] of s.entries()) {
        arr.push([k, v])
      }
      return arr
    })
    assert.equal(items.length, 3)
    assert.equal(items[0][0], 'bar')
    assert.equal(items[0][1], '🍻')
    assert.equal(items[1][0], 'boz')
    assert.deepEqual(items[1][1], { test: 1138 })
    assert.equal(items[2][0], 'foo')
    assert.equal(items[2][1], 123)
  }),

  'sublevels': withTmpDir(async (assert, dir) => {
    /** @type {Array<[string, any]>} */
    const items = [
      ['foo', { bar: 'baz' }],
      ['bar', 'boz']
    ]
    const store = new TransactionalStore(dir)
    const prefix0 = 'sub0/'
    const subStore0 = new SubTransactionalStore(prefix0, store)
    const prefix1 = 'sub1/'
    const subStore1 = new SubTransactionalStore(prefix1, store)

    await subStore0.transact(async s => {
      for (const [k, v] of items) {
        await s.put(k, v)
      }
    })

    await subStore0.transact(async s => {
      for (const [k, v] of items) {
        const value = await s.get(k)
        assert.deepEqual(value, v)
      }
      for await (const [k, v] of s.entries()) {
        assert.deepEqual(items.find(i => i[0] === k), [k, v])
      }
    })

    await subStore1.transact(async s => {
      for (const [k, v] of items) {
        await s.put(k, v)
      }
    })

    await subStore1.transact(async s => {
      for (const [k, v] of items) {
        const value = await s.get(k)
        assert.deepEqual(value, v)
      }
      for await (const [k, v] of s.entries()) {
        assert.deepEqual(items.find(i => i[0] === k), [k, v])
      }
    })

    await store.transact(async s => {
      for (const p of [prefix0, prefix1]) {
        for (const [k, v] of items) {
          const value0 = await s.get(`${p}${k}`)
          assert.deepEqual(value0, v)
        }
      }
    })
  })
}