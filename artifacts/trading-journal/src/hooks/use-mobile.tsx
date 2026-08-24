import * as React from "react"

function getIsMobile(): boolean {
  if (typeof window === "undefined") return false
  // The Charts workspace intentionally uses the same drawing interaction in
  // portrait and landscape. Other application pages keep the original
  // orientation-based mobile behavior.
  if (window.location.pathname === "/charts") return true
  return window.matchMedia("(orientation: portrait)").matches
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => getIsMobile())

  React.useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)")
    let timer: ReturnType<typeof setTimeout> | null = null

    const onChange = () => {
      // Debounce orientation change by 320ms to prevent rapid mount/unmount
      // cycles when the device fires multiple events during a rotation animation
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        setIsMobile(getIsMobile())
        timer = null
      }, 320)
    }

    mql.addEventListener("change", onChange)
    return () => {
      mql.removeEventListener("change", onChange)
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  return isMobile
}
