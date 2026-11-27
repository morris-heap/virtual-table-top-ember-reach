// Making a map (VTTER-74): blank or generated, the seed, and the 3-map limit.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import mapData from '../../../data/map.json'

const save = vi.fn()
vi.mock('../api/client.ts', () => ({
  ApiError: class extends Error {},
  mapsApi: { save: (...a: unknown[]) => save(...a), list: vi.fn(), get: vi.fn(), remove: vi.fn() },
}))
vi.mock('../nav.ts', () => ({ navigate: vi.fn() }))

const { NewMapForm } = await import('./Maps.tsx')
const { navigate } = await import('../nav.ts')

beforeEach(() => { save.mockReset(); vi.mocked(navigate).mockReset() })
afterEach(cleanup)

describe('a new map', () => {
  it('makes a blank map of the chosen size and opens it', async () => {
    save.mockResolvedValue({})
    render(<NewMapForm atLimit={false} limit={3} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'The vent' } })
    fireEvent.change(screen.getByLabelText('Size'), { target: { value: 'medium' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make the map' }))
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled())
    const [id, body] = save.mock.calls[0]
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body).toMatchObject({ name: 'The vent', size: 'medium', width: 50, height: 50, objects: [], schemaVersion: mapData.schemaVersion })
    expect(navigate).toHaveBeenCalledWith(`/maps/${id}`)
  })

  it('generates from a seed, and the same seed makes the same map', async () => {
    save.mockResolvedValue({})
    render(<NewMapForm atLimit={false} limit={3} />)
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'cave' } })
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'hearth' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make the map' }))
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    cleanup()
    render(<NewMapForm atLimit={false} limit={3} />)
    fireEvent.change(screen.getByLabelText('Start from'), { target: { value: 'cave' } })
    fireEvent.change(screen.getByLabelText('Seed'), { target: { value: 'hearth' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make the map' }))
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    const [a, b] = save.mock.calls.map(c => c[1])
    expect(a.objects.length).toBeGreaterThan(2)
    expect(a.objects.some((o: { type: string }) => o.type === 'start')).toBe(true)
    expect(b.objects).toEqual(a.objects)
  })

  it("shows the API's refusal when a 4th map is refused", async () => {
    save.mockRejectedValue(new Error('You can have 3 maps. Delete one to make another.'))
    render(<NewMapForm atLimit={false} limit={3} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make the map' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('You can have 3 maps. Delete one to make another.')
    expect(navigate).not.toHaveBeenCalled()
  })

  it('says why it can’t make one at the limit, instead of a form', () => {
    render(<NewMapForm atLimit limit={mapData.limits.mapsPerUser} />)
    expect(screen.getByRole('status')).toHaveTextContent(`You have ${mapData.limits.mapsPerUser} maps`)
    expect(screen.queryByRole('button', { name: 'Make the map' })).toBeNull()
  })
})
