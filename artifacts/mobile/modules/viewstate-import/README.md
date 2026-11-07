# ViewState private Android import module

Local Expo SDK 54 module, autolinked from `modules/`. This is Android-only; it does
not add an iOS extension or change package, EAS project, scheme or Google callback.
`withIncomingImport.cjs` adds only explicit Android SEND/SEND_MULTIPLE MIME filters.
No chat, accessibility, notification-reading or background-service permission.

Incoming URI grants are copied to bounded, private staging files off the JS thread.
Each delivery gets a stable ID, an atomic payload manifest and an account claim on
first consumption. A different account cannot consume that claim. JS acknowledges
only after account-scoped copies and inbox metadata have been read back. Native
staging is removed on acknowledgement. There is no sender identity inference.

OCR runs only when requested, with a fresh Tesseract instance and a bounded decoded
bitmap. Only files under the supplied active account media root are accepted.
Nothing is uploaded. Android module availability is optional in JS: old APKs,
Expo Go and web retain paste/review, with image OCR explicitly unavailable.

## Dependencies and provenance

- Tesseract4Android `cz.adaptech.tesseract4android:tesseract4android:4.9.0`, Apache-2.0:
  https://github.com/adaptech-cz/Tesseract4Android
- Tesseract fast Arabic/English model data, Apache-2.0, bundled for offline use:
  https://github.com/tesseract-ocr/tessdata_fast
- Model license included at `android/src/main/assets/viewstate-ocr/LICENSE`.
- SHA-256, `ara.traineddata`:
  `e3206d3dc87fd50c24a0fb9f01838615911d25168f4e64415244b67d2bb3e729`
- SHA-256, `eng.traineddata`:
  `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`

The two models occupy about 5.3 MiB before APK compression; native library size is
additional. Model files are copied to private app storage lazily on the first OCR
request. No runtime model download or cloud AI key is required.

## Limits and acceptance

40,000 text characters; 20 attachments per delivery; 50 MiB per incoming file,
150 MiB aggregate native delivery. JPEG, PNG, WebP, MP4, QuickTime and PDF only.
OCR accepts images up to 20 MiB, downsamples large bitmaps and bounds text length.
PDF/video are attachments, not OCR or transcription inputs. Links are references,
not remotely fetched pages. OCR can omit or misread digits even on clean images;
all suggestions remain editable and require explicit review, not auto-save.

Verified: SDK 54 Android prebuild, autolinking, and `:viewstate-import:compileDebugKotlin`.
Native intent lifecycle, URI grant behavior, OCR quality/performance, and interrupted
receipt recovery still require the new APK on an Android device. Compilation is
not a device test, and no APK was produced during this change.
