# DeepChart Voice Alerts

Minimal Android companion app for DeepChart Telegram voice alerts.

## What it does
- Listens to Telegram notifications using Android Notification Access.
- Recognizes `TL-xxxx Touched`, `TL-xxxx Broken`, and `TL-xxxx Retested`.
- Immediately speaks `Hello, TL-xxxx Touched/Broken/Retested` using Android Text-to-Speech.
- Suppresses the same event for 5 seconds to avoid duplicate speech.
- Supports Telegram and Telegram X package IDs.

## Setup on phone
1. Install the generated debug APK.
2. Open **DeepChart Voice Alerts**.
3. Tap **Allow Notification Access** and enable the app.
4. Keep Telegram notifications enabled and allow their message text to appear.
5. Tap **Test Voice** once.

## Expected DeepChart Telegram text
Use these exact patterns (case-insensitive):
- `TL-0103 Touched`
- `TL-0103 Broken`
- `TL-0103 Retested`

The Android app converts them to spoken phrases such as: `Hello, TL-0103 Touched`.

## Build
The GitHub Actions workflow builds a debug APK and publishes it as a workflow artifact.
