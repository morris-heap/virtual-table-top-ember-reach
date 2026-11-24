// Synthesized dice sounds (VTTER-79). Web Audio only, so there are no audio files to license or hot-link.
import { allowImpact, impactParams, type ImpactKind } from '../engine/diceSound'

export class DiceSound {
  muted: boolean
  private ctx: AudioContext | null = null
  private noise: AudioBuffer | null = null
  private voices = 0
  private last = -Infinity

  constructor(muted: boolean) {
    this.muted = muted
  }

  /** Browsers only allow audio after a gesture: call this from a click, key press or pointer down. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    const length = Math.floor(this.ctx.sampleRate * 0.25)
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }

  impact(kind: ImpactKind, speed: number) {
    const ctx = this.ctx
    if (this.muted || !ctx || !this.noise || ctx.state !== 'running') return
    const now = performance.now()
    if (!allowImpact(now, this.last, this.voices)) return
    const p = impactParams(kind, speed)
    if (!p) return
    this.last = now
    this.voices++

    const t = ctx.currentTime
    const end = t + p.duration
    const master = ctx.createGain()
    master.gain.setValueAtTime(p.gain * 0.5, t)
    master.gain.exponentialRampToValueAtTime(0.001, end)
    master.connect(ctx.destination)

    const source = ctx.createBufferSource()
    source.buffer = this.noise
    const band = ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.frequency.value = p.freq
    band.Q.value = 1.4
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = p.noise
    source.connect(band).connect(noiseGain).connect(master)
    source.start(t, Math.random() * 0.1, p.duration)

    if (p.noise < 1) {
      const thump = ctx.createOscillator()
      thump.type = 'sine'
      thump.frequency.setValueAtTime(p.freq * 0.35, t)
      thump.frequency.exponentialRampToValueAtTime(Math.max(40, p.freq * 0.12), end)
      const thumpGain = ctx.createGain()
      thumpGain.gain.value = 1 - p.noise
      thump.connect(thumpGain).connect(master)
      thump.start(t)
      thump.stop(end)
    }
    source.onended = () => { this.voices = Math.max(0, this.voices - 1); master.disconnect() }
  }

  dispose() {
    void this.ctx?.close()
    this.ctx = null
  }
}
