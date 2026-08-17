import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? `signal ${signal}`}`))
    })
  })
}

await rm(new URL('../lib', import.meta.url), { recursive: true, force: true })
await run(fileURLToPath(new URL('../node_modules/.bin/tsc', import.meta.url)), ['--noEmit'])
await run(fileURLToPath(new URL('../node_modules/.bin/tsdown', import.meta.url)), ['--config', 'tsdown.config.ts'])
