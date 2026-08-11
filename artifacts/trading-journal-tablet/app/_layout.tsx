import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";

SplashScreen.preventAutoHideAsync();

// Maximum time (ms) we'll wait for fonts before rendering anyway.
// Prevents the app from hanging forever on the splash screen when font
// loading stalls (asset registry miss, network hiccup, pnpm symlink lag).
const FONT_TIMEOUT_MS = 4000;

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "none" }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // renderReady flips to true when fonts are done (loaded or failed) OR
  // when the timeout fires — whichever comes first.
  const [renderReady, setRenderReady] = useState(false);

  // Primary path: fonts resolved normally.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }
  }, [fontsLoaded, fontError]);

  // Fallback path: hide splash and render regardless after FONT_TIMEOUT_MS.
  // This guarantees the app is never permanently stuck on the splash screen.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setRenderReady(true);
    }, FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  if (!renderReady) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <RootLayoutNav />
        </GestureHandlerRootView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
