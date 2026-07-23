import type React from 'react'

const PLACEHOLDER_SRC = 'ap-assets:///images/placeholder.png'

export function imgOnError(e: React.SyntheticEvent<HTMLImageElement>): void {
  const img = e.target as HTMLImageElement
  console.warn('[ap-assets] image not found:', img.src)
  if (img.src === PLACEHOLDER_SRC) {
    img.style.display = 'none'
    return
  }
  img.src = PLACEHOLDER_SRC
}
