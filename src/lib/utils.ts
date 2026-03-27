import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtNumber(n: number, decimals = 4): string {
  if (Math.abs(n) >= 1000) return n.toExponential(3)
  return n.toFixed(decimals)
}

export function fmtTime(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1e6).toFixed(1)} µs`
  if (seconds < 1) return `${(seconds * 1000).toFixed(3)} ms`
  return `${seconds.toFixed(4)} s`
}

export function fmtSampleRate(hz: number): string {
  if (hz >= 1_000_000) return `${(hz / 1_000_000).toFixed(0)} MHz`
  return `${(hz / 1_000).toFixed(0)} kHz`
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function fmtDuration(s: number): string {
  if (s < 1) return `${(s * 1000).toFixed(1)} ms`
  return `${s.toFixed(2)} s`
}
