import * as React from "react"

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false

  // Drawing/touch interactions must stay in mobile mode after rotating a phone
  // or tablet to landscape. Previously this hook equated "mobile" with portrait,
  // which disabled DrawingOverlay's mobile crosshair + tap-to-place model as soon
  // as orientation became landscape.
  const portrait = window.matchMedia("(orientation: portrait)").matches
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches
  const noHover = window.matchMedia("(hover: none)").matches

  return portrait || (coarsePointer && noHover)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => getIsMobile())

  React.useEffect(() => {
    const orientationMql = window.matchMedia("(orientation: portrait)")
    const pointerMql = window.matchMedia("(pointer: coarse)")
    const hoverMql = window.matchMedia("(hover: none)")
    let timer: ReturnType<typeof setTimeout> | null = null

    const onChange = () => {
      // Debounce orientation/input-capability changes so rotation does not cause
      // rapid mount/unmount cycles while the browser is resizing the viewport.
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        setIsMobile(getIsMobile())
        timer = null
      }, 320)
    }

    orientationMql.addEventListener("change", onChange)
    pointerMql.addEventListener("change", onChange)
    hoverMql.addEventListener("change", onChange)

    return () => {
      orientationMql.removeEventListener("change", onChange)
      pointerMql.removeEventListener("change", onChange)
      hoverMql.removeEventListener("change", onChange)
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  return isMobile
}
