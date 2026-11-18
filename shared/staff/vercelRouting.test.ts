import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('vercel /code routing contracts', () => {
  const vercel = JSON.parse(
    readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
  ) as {
    rewrites?: Array<{ source: string; destination: string }>
  }

  const vite = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')

  it('maps /code and /code/ to the staff multipage HTML, not the game shell', () => {
    const rewrites = vercel.rewrites ?? []
    expect(rewrites).toEqual(
      expect.arrayContaining([
        { source: '/code', destination: '/code/index.html' },
        { source: '/code/', destination: '/code/index.html' },
      ]),
    )
    // SPA fallback may mention code only inside a negative lookahead exclusion.
    const spa = rewrites.find((rule) => rule.destination === '/index.html')
    expect(spa?.destination).toBe('/index.html')
    expect(spa?.source).toMatch(/\(\?!.*code/)
    expect(rewrites.filter((rule) => rule.destination === '/code/index.html')).toHaveLength(2)
  })

  it('excludes /api from the SPA fallback rewrite', () => {
    const spa = (vercel.rewrites ?? []).find((rule) => rule.destination === '/index.html')
    expect(spa?.source).toMatch(/\(\?!.*api/)
    expect(spa?.source).not.toMatch(/^\/api/)
  })

  it('keeps Vite multipage input for code/index.html', () => {
    expect(vite).toContain("code: resolve(__dirname, 'code/index.html')")
    expect(readFileSync(resolve(process.cwd(), 'code/index.html'), 'utf8')).toContain(
      '/src/code/main.tsx',
    )
  })
})
