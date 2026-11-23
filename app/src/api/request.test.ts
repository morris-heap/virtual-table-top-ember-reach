import { describe, expect, it } from 'vitest'
import { errorMessage, jsonInit } from './request.ts'

describe('jsonInit', () => {
  it('sends the bearer token and no body for a GET', () => {
    expect(jsonInit('GET', 'abc')).toEqual({ method: 'GET', headers: { Authorization: 'Bearer abc' }, body: undefined })
  })
  it('sends JSON with a content type for a PUT', () => {
    expect(jsonInit('PUT', 'abc', { gameMaster: true })).toEqual({
      method: 'PUT',
      headers: { Authorization: 'Bearer abc', 'Content-Type': 'application/json' },
      body: '{"gameMaster":true}',
    })
  })
  it('never puts a user id in the request: the API reads it from the token', () => {
    expect(JSON.stringify(jsonInit('GET', 'abc'))).not.toMatch(/owner|user/i)
  })
})

describe('errorMessage', () => {
  const res = (status: number, body: unknown) => ({ status, json: async () => body })

  it("uses the API's own message when there is one", async () => {
    expect(await errorMessage(res(400, { error: 'title must be 1-80 characters' }))).toBe('title must be 1-80 characters')
  })
  it('falls back to a plain line for the status', async () => {
    expect(await errorMessage(res(401, {}))).toMatch(/Sign in again/)
    expect(await errorMessage(res(503, {}))).toMatch(/busy/)
    expect(await errorMessage(res(500, {}))).toBe('Something went wrong (500).')
  })
  it('copes with a body that is not JSON', async () => {
    expect(await errorMessage({ status: 502, json: async () => { throw new Error('html') } })).toBe('Something went wrong (502).')
  })
})
