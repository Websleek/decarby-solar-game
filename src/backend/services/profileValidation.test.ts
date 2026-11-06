import { describe, expect, it } from 'vitest'
import { BackendError } from '../errors'
import { validateNickname } from '../nickname'
import { profileService } from './profile'

describe('profile service validation', () => {
  it('rejects invalid nicknames before touching the network', async () => {
    await expect(profileService.upsertMyNickname('!!')).rejects.toBeInstanceOf(BackendError)
    await expect(profileService.upsertMyNickname('!!')).rejects.toMatchObject({
      code: 'validation',
    })
  })

  it('shares the same validation rules as the pure helper', () => {
    const result = validateNickname('NicePlayer1')
    expect(result.ok).toBe(true)
  })
})
