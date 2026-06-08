import type React from 'react'

export function imgOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const img = e.target as HTMLImageElement
  console.warn('[ap-assets] image not found:', img.src)
  img.style.display = 'none'
}
