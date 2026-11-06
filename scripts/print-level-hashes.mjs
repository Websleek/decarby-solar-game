/**
 * One-off helper: prints hashLevelConfiguration for all local levels.
 * Mirrors src/backend/levelHash.ts exactly.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function buildLevelConfigurationPayload(level) {
  return {
    id: level.id,
    version: level.puzzleVersion,
    columns: level.columns,
    rows: level.rows,
    blockedCells: level.blockedCells,
    outsideCells: level.outsideCells,
    inventory: level.inventory,
    finishThreshold: level.finishThreshold,
    scoring: level.scoring,
    starThresholds: level.starThresholds,
  }
}

function hashLevelConfiguration(level) {
  const json = JSON.stringify(buildLevelConfigurationPayload(level))
  let hash = 2166136261
  for (let i = 0; i < json.length; i += 1) {
    hash ^= json.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

// Load TS level modules via Vite SSR transform through vitest is heavy;
// instead duplicate minimal field extraction by importing compiled sources with tsx if available.
async function main() {
  const { createServer } = await import('vite')
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const mod = await server.ssrLoadModule('/src/levels/index.ts')
    const levels = mod.listLocalLevels()
    for (const level of levels) {
      console.log(
        JSON.stringify({
          levelId: level.id,
          puzzleVersion: level.puzzleVersion,
          configurationHash: hashLevelConfiguration(level),
        }),
      )
    }
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
