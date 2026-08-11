import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";

// Guard against Metro injecting the literal string "undefined" when the env
// var was not set at bundle time, and against an empty string.
const _raw = process.env.EXPO_PUBLIC_DOMAIN;
const DOMAIN = (_raw && _raw !== "undefined") ? _raw : "";
const WEB_URL = DOMAIN ? `https://${DOMAIN}/` : "";

const TABLET_UA =
  "Mozilla/5.0 (Linux; Android 13; Lenovo TB-J716F Build/TP1A.220624.014) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.6099.230 Safari/537.36";

// ── Rubber-band script (runs inside the WebView) ───────────────────────────
//
// Why JavaScript-only instead of Animated.View translateY on the RN side:
//   Translating the WebView *frame* at the RN level moves every element in
//   the page, including position:fixed header and bottom-nav — exactly what
//   the user reported seeing.  Applying transform only to the scroll
//   container div leaves all fixed/sticky chrome in place.
//
// Two mechanisms:
//   1. Touch-drag at boundary — touchmove fires while the user drags past the
//      end of a scroll container.  We apply a logarithmic resistance curve
//      directly via element.style.transform (no async round-trip to RN).
//
//   2. Momentum hits boundary — scroll events continue after the finger lifts
//      during a fling.  We track per-element velocity and play a bounce-out /
//      spring-back animation via requestAnimationFrame when the container
//      reaches its edge with significant speed.
//
// We keep bounces={false} / overScrollMode="never" so the native UIScrollView
// never double-bounces alongside the JS animation.
const RUBBER_BAND_JS = `
(function() {
  if (window._rbInit) return;
  window._rbInit = true;

  var MAX_PX = 72; // maximum rubber-band displacement

  // Logarithmic resistance: responsive near 0, levels off at MAX_PX
  function curve(raw) {
    var s = raw > 0 ? 1 : -1;
    return s * MAX_PX * (1 - Math.exp(-Math.abs(raw) / MAX_PX));
  }

  // Read the current translateY — inline style during drag, computed matrix
  // during a CSS transition (mid-flight cancellation).
  function getY(el) {
    var m = el.style.transform && el.style.transform.match(/translateY\\(([-.\\d]+)px\\)/);
    if (m) return parseFloat(m[1]);
    var t = window.getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    var parts = t.match(/matrix.*\\((.+)\\)/);
    return parts ? parseFloat(parts[1].split(', ')[5] || '0') : 0;
  }

  // Cancel any in-progress animation and freeze at the current painted position.
  // Must be called before starting a new animation on the same element.
  function freeze(el) {
    if (el._rbRaf)   { cancelAnimationFrame(el._rbRaf);  el._rbRaf   = null; }
    if (el._rbTimer) { clearTimeout(el._rbTimer);        el._rbTimer = null; }
    var y = getY(el);
    el.style.transition = 'none';
    el.style.transform  = y ? 'translateY(' + y + 'px)' : '';
  }

  // CSS ease-out spring back — no overshoot, exact rubber-band feel.
  // cubic-bezier(0.22,1,0.36,1) is an expo-out curve: starts fast,
  // decelerates strongly, never crosses zero → no ball-bounce artefact.
  function springBack(el) {
    freeze(el);
    // Two rAF ticks let the browser commit transition:none before we
    // set the new transition, otherwise the two writes collapse into one
    // style recalc and the animation is skipped entirely.
    el._rbRaf = requestAnimationFrame(function() {
      el._rbRaf = requestAnimationFrame(function() {
        el._rbRaf = null;
        el.style.transition = 'transform 0.42s cubic-bezier(0.22,1,0.36,1)';
        el.style.transform  = '';
        el._rbTimer = setTimeout(function() {
          el._rbTimer = null;
          el.style.transition = '';
        }, 440);
      });
    });
  }

  // rAF-based ease-out to target, then hand off to springBack.
  // Used for the momentum bounce-out phase only.
  function bounceOut(el, target, duration) {
    freeze(el);
    var start   = getY(el);
    var startTs = null;

    function easeOutQuad(t) { return 1 - (1-t)*(1-t); }

    function step(ts) {
      if (!startTs) startTs = ts;
      var t = Math.min((ts - startTs) / duration, 1);
      el.style.transform = 'translateY(' + (start + (target - start) * easeOutQuad(t)) + 'px)';
      if (t < 1) { el._rbRaf = requestAnimationFrame(step); }
      else        { el._rbRaf = null; springBack(el); }
    }
    el._rbRaf = requestAnimationFrame(step);
  }

  // Walk up the DOM to find the nearest overflow:auto/scroll ancestor
  function scrollParent(el) {
    while (el && el !== document.body) {
      var oy = window.getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  }

  // ── 1. Touch-drag ──────────────────────────────────────────────────────────
  var startY  = 0;
  var active  = null;
  var pulling = false;

  document.addEventListener('touchstart', function(e) {
    startY  = e.touches[0].clientY;
    active  = scrollParent(e.target);
    pulling = false;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!active) return;
    var dy      = e.touches[0].clientY - startY;
    var atTop   = active.scrollTop <= 0;
    var atBot   = active.scrollTop + active.clientHeight >= active.scrollHeight - 1;

    if ((atTop && dy > 0) || (atBot && dy < 0)) {
      if (active._rbCancel) { active._rbCancel(); }
      pulling = true;
      active.style.transform = 'translateY(' + curve(dy) + 'px)';
    } else if (pulling) {
      pulling = false;
      springBack(active);
    }
  }, { passive: true });

  function onTouchEnd() {
    if (pulling && active) { pulling = false; springBack(active); }
    pulling = false;
  }
  document.addEventListener('touchend',    onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  // ── 2. Momentum scroll hits boundary ──────────────────────────────────────
  var tracked = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

  function attachMomentum(el) {
    if (!el) return;
    if (tracked) { if (tracked.has(el)) return; } else { if (el._rbTracked) return; el._rbTracked = true; }
    var oy = window.getComputedStyle(el).overflowY;
    if (oy !== 'auto' && oy !== 'scroll') return;
    if (el.scrollHeight <= el.clientHeight) return;
    if (tracked) tracked.add(el);

    var prevTop  = el.scrollTop;
    var prevTime = Date.now();
    var vel      = 0;
    var bounced  = false; // fire only once per momentum run per boundary hit

    el.addEventListener('scroll', function() {
      var now = Date.now();
      var dt  = Math.max(now - prevTime, 1);
      vel      = (el.scrollTop - prevTop) / dt;
      prevTop  = el.scrollTop;
      prevTime = now;

      var atTop = el.scrollTop <= 0;
      var atBot = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      // Reset the once-per-hit guard when we move away from the boundary
      if (!atTop && !atBot) { bounced = false; return; }

      if (!pulling && !bounced && Math.abs(vel) > 0.25) {
        bounced = true;
        var swing    = Math.min(Math.abs(vel) * 16, MAX_PX);
        var dir      = atTop ? 1 : -1;
        var duration = Math.min(swing * 1.6, 130);
        bounceOut(el, dir * swing, duration);
      }
    }, { passive: true });
  }

  function scan(root) {
    try {
      var all = (root || document).querySelectorAll('*');
      for (var i = 0; i < all.length; i++) attachMomentum(all[i]);
    } catch (_) {}
  }

  scan(document);

  // Pick up scroll containers added by SPA route changes
  new MutationObserver(function(muts) {
    muts.forEach(function(m) {
      m.addedNodes.forEach(function(n) {
        if (n.nodeType === 1) { attachMomentum(n); scan(n); }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  true;
})();
`;

function buildOrientationScript(isLandscape: boolean): string {
  const vpWidth = isLandscape ? 1340 : 430;
  return `
(function() {
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.appendChild(meta);
  }
  meta.content = 'width=${vpWidth}, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  requestAnimationFrame(function() {
    setTimeout(function() {
      window.dispatchEvent(new Event('orientationchange'));
      window.dispatchEvent(new Event('resize'));
    }, 32);
  });
})();
true;
`;
}

function LoadingView() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color="#22c55e" />
    </View>
  );
}

function MissingDomainScreen() {
  return (
    <View style={styles.loading}>
      <Text style={{ color: "#ef4444", fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>
        Configuration error
      </Text>
      <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center", paddingHorizontal: 32 }}>
        EXPO_PUBLIC_DOMAIN is not set.{"\n"}
        Restart the Expo workflow so the Replit dev domain is baked into the bundle.
      </Text>
    </View>
  );
}

export default function TabletScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= height;
  const webViewRef   = useRef<WebView>(null);
  const prevLandscape = useRef<boolean | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (prevLandscape.current === isLandscape) return;
    prevLandscape.current = isLandscape;
    webViewRef.current?.injectJavaScript(buildOrientationScript(isLandscape));
  }, [isLandscape]);

  // Show an explicit error instead of a broken WebView when the domain is missing.
  if (!WEB_URL) return <MissingDomainScreen />;

  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <iframe
          src={WEB_URL}
          style={iframeStyle}
          title="Trading Journal"
          allow="clipboard-read; clipboard-write"
        />
      </View>
    );
  }

  // Edge-to-edge on Android (Expo SDK 54+) is mandatory and cannot be opted
  // out of — the app always draws behind the status bar and navigation bar.
  // Fighting that with a translucent={false} StatusBar or a SafeAreaView
  // that consumes ALL edges around the WebView is what caused the status
  // bar to intermittently vanish and a stray bottom gap to appear: the
  // native side was reserving inset space *and* the web page's own CSS
  // (env(safe-area-inset-*)) was racing it, so depending on which insets
  // arrived first the two would over- or under-compensate.
  //
  // Correct approach: let the WebView itself be truly edge-to-edge (no
  // SafeAreaView wrapping it) so `viewport-fit=cover` + `env()` inside the
  // web app can size its own header/bottom-nav against the real device
  // insets. The only inset consumed natively here is `insets.top`, applied
  // as a simple spacer above the WebView so the page's sticky header never
  // renders underneath the status bar. No inset is subtracted from the
  // screen height anywhere — the WebView is `flex: 1` and fills whatever
  // space remains.
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={{ height: insets.top, backgroundColor: "#0d1117" }} />
      <WebView
        ref={webViewRef}
        source={{ uri: WEB_URL }}
        style={styles.webview}
        userAgent={TABLET_UA}
        // Signal to the web app that the Expo native layer has already reserved
        // insets.top as a spacer above this WebView.  The web app reads
        // window.__EXPO_TABLET__ at render time and sets safe-area padding to
        // 0px so it doesn't double-count.  A plain window assignment is used
        // (not DOM manipulation) because injectedJavaScriptBeforeContentLoaded
        // fires before the document element exists on Android, making any
        // document.* calls unreliable at this stage.
        injectedJavaScriptBeforeContentLoaded={"window.__EXPO_TABLET__ = true; true;"}
        injectedJavaScript={buildOrientationScript(isLandscape) + "\n" + RUBBER_BAND_JS}
        injectedJavaScriptForMainFrameOnly
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        scalesPageToFit={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        startInLoadingState
        renderLoading={() => <LoadingView />}
        onError={(e) =>
          console.warn("[WebView] error", e.nativeEvent.description)
        }
        onHttpError={(e) =>
          console.warn("[WebView] HTTP", e.nativeEvent.statusCode, WEB_URL)
        }
        onContentProcessDidTerminate={() => {
          webViewRef.current?.reload();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0d1117",
  },
  loading: {
    flex: 1,
    backgroundColor: "#0d1117",
    alignItems: "center",
    justifyContent: "center",
  },
});

const iframeStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  border: "none",
  backgroundColor: "#0d1117",
};
