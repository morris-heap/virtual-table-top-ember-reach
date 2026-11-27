// The map editor (VTTER-74): adding objects, the layer tree, editing properties, GM-only, and saving.
// The canvas itself isn't drawn in jsdom; painting is covered by the engine tests (mapModel.paint, mapView), and
// the art drawn over the hexes by mapArt.test.ts (VTTER-119).
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { newMap, type MapDoc } from '../engine/mapModel.ts'
import { Editor } from './MapEditor.tsx'

beforeAll(() => {
  // jsdom has no canvas; the editor draws nothing and everything else still works.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
})
afterEach(cleanup)

const blank = (): MapDoc => ({ ...newMap('Forge corridor', 'small'), id: 'm1', updatedAt: '2026-11-27T00:00:00Z' })

function open(initial = blank(), onSave = vi.fn(async (m: Omit<MapDoc, 'id' | 'updatedAt'>) => ({ ...m, id: 'm1', updatedAt: 'now' }))) {
  render(<Editor initial={initial} onSave={onSave} />)
  return { onSave }
}

const addKind = (kind: string, type: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(kind) }))
  fireEvent.change(screen.getByLabelText('Type', { selector: '.map-type select' }), { target: { value: type } })
  fireEvent.click(screen.getByRole('button', { name: /^Add / }))
}

describe('the map editor', () => {
  it('adds an object of the chosen kind and type, selects it, and lists it in the layers', () => {
    open()
    addKind('Environment space', 'mud')
    const tree = screen.getByRole('tree', { name: 'Layers' })
    expect(within(tree).getByText('Mud')).toBeInTheDocument()
    // Mud is Difficult by default, and Difficult acts now.
    expect(within(tree).getByText('difficult')).toHaveClass('now')
    expect(screen.getByRole('heading', { name: 'Mud' })).toBeInTheDocument()
    expect(screen.getByText('acts now')).toBeInTheDocument()
    // Painting is the next step, so the tool switches to Paint.
    expect(screen.getByRole('button', { name: 'Paint' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('nests a new object under the selected Enclosure', () => {
    open()
    addKind('Enclosure', 'cavern')
    addKind('Route', 'wall')
    const tree = screen.getByRole('tree', { name: 'Layers' })
    const cavern = within(tree).getByText('Cavern').closest('li')!
    expect(within(cavern).getByText('Wall')).toBeInTheDocument()
    expect(within(cavern).getByText('Route · edge')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paint edges' })).toBeInTheDocument()
  })

  it('turns a default property off, and marks describing properties as acting later', () => {
    open()
    addKind('Environment space', 'forest')
    fireEvent.click(screen.getAllByRole('button', { name: 'Turn off' })[0])
    expect(within(screen.getByRole('tree', { name: 'Layers' })).queryByText('difficult')).toBeNull()
    // Cover (from Forest) acts later.
    expect(screen.getAllByText('acts later').length).toBeGreaterThan(0)
  })

  it('adds a property from the catalog with a value input', () => {
    open()
    addKind('Environment space', 'steam-vents')
    fireEvent.change(screen.getByLabelText('Add a property'), { target: { value: 'hidden' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('spinbutton', { name: 'Value' })).toHaveValue(12)
  })

  it('marks an object GM-only in the layers', () => {
    open()
    addKind('Environment space', 'steam-vents')
    fireEvent.click(screen.getByRole('checkbox', { name: /GM-only/ }))
    expect(within(screen.getByRole('tree', { name: 'Layers' })).getByText('GM')).toBeInTheDocument()
  })

  it('saves the whole map without its id or timestamp, then says Saved', async () => {
    const { onSave } = open()
    addKind('Static Object', 'start')
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Unsaved changes')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Saved')
    const body = onSave.mock.calls[0][0]
    expect(body).not.toHaveProperty('id')
    expect(body).not.toHaveProperty('updatedAt')
    expect(body.objects).toEqual([expect.objectContaining({ kind: 'static', type: 'start' })])
  })

  it('shows the API refusal, and blocks saving a map with no name', async () => {
    open(blank(), vi.fn(async () => { throw new Error('This map is too big to save.') }))
    addKind('Static Object', 'exit')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('This map is too big to save.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Map name'), { target: { value: '' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Give the map a name.')).toBeInTheDocument()
  })

  it('undoes the last change', () => {
    open()
    addKind('Environment space', 'mud')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByRole('tree', { name: 'Layers' })).toBeNull()
  })

  it('keeps the grid off for viewing, and the Grid toggle turns it on whatever the tool (VTTER-119)', () => {
    open()
    const grid = screen.getByRole('button', { name: 'Grid' })
    expect(grid).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(grid)
    expect(grid).toHaveAttribute('aria-pressed', 'true')
    // Painting shows the grid by itself; switching tools never changes the author's toggle.
    fireEvent.click(screen.getByRole('button', { name: 'Paint' }))
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(grid).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(grid)
    expect(grid).toHaveAttribute('aria-pressed', 'false')
    // The canvas is still the map either way.
    expect(screen.getByRole('img', { name: /Hex map/ })).toBeInTheDocument()
  })

  it('removes an object, moving what sat on it down a layer', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    open()
    addKind('Enclosure', 'cavern')
    addKind('Environment space', 'rock-floor')
    fireEvent.click(within(screen.getByRole('tree', { name: 'Layers' })).getByText('Cavern'))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cavern' }))
    const tree = screen.getByRole('tree', { name: 'Layers' })
    expect(within(tree).queryByText('Cavern')).toBeNull()
    expect(within(tree).getByText('Rock floor')).toBeInTheDocument()
  })
})
