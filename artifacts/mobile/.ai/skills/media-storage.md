# ViewState AI Skill — Media & Storage

**Read this before implementing any media upload or storage functionality in ViewState.**

---

## Overview

Properties in ViewState can have up to 10 photos. Media is stored in object storage (provider TBD — see `decisions-log.md` DEC-006) and referenced in the `property_media` table.

---

## Media Rules

| Rule | Value |
|------|-------|
| Max photos per property | 10 |
| Max file size (before compression) | No limit |
| After compression: max width | 1200px |
| After compression: quality | 80% JPEG |
| Accepted formats | JPEG, PNG (converted to JPEG on upload) |
| Video | Not supported in v1 |

---

## Image Picker

```typescript
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

async function pickPropertyPhotos(): Promise<string[]> {
  if (Platform.OS !== 'web') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      // Show "Enable in Settings" prompt
      return [];
    }
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 10,
    quality: 0.8,
    base64: false,
  });

  if (result.canceled) return [];
  return result.assets.map(a => a.uri);
}
```

---

## Upload Flow

1. User selects photos via `expo-image-picker`
2. Client compresses each photo to max 1200px wide, 80% quality
3. Client requests a signed upload URL from the API server (`POST /api/media/upload-url`)
4. Client uploads directly to object storage using the signed URL
5. After successful upload, client tells the server the upload is complete (`POST /api/media/confirm`)
6. Server creates a `property_media` record

This pattern keeps binary data off the Express server.

---

## Compression Before Upload

```typescript
import * as ImageManipulator from 'expo-image-manipulator';

async function compressImage(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );
  return result.uri;
}
```

---

## Upload Progress UI

Each photo shows individual upload progress:
- Thumbnail with overlay progress bar (0–100%)
- ✓ checkmark on completion
- ✗ retry button on failure
- X delete button to remove before upload

Upload all photos concurrently (not sequentially) with `Promise.allSettled` — if one fails, others continue.

---

## Storage Key Convention

```
properties/{property_id}/{timestamp}_{index}.jpg
```

Example: `properties/uuid-123/1720000000000_0.jpg`

---

## Media Display

```typescript
import { Image } from 'expo-image';

// Always use expo-image (not React Native's Image) for property photos
// expo-image handles caching, progressive loading, and blurhash placeholders

<Image
  source={{ uri: photo.url }}
  style={styles.photo}
  contentFit="cover"
  placeholder={photo.blurhash}
  transition={200}
/>
```

---

## Platform Notes

- `expo-image-picker`: partial web support — works but multi-select may be limited
- `expo-image-manipulator`: works on iOS, Android, and web
- Object storage uploads: direct from device to storage URL — works on all platforms if the URL is HTTPS

---

## Permissions — Camera vs. Gallery

| Action | Permission needed |
|--------|------------------|
| Pick from gallery | `MEDIA_LIBRARY` |
| Take a photo | `CAMERA` |

Always request the minimum permission. If the broker wants to take a photo, request camera permission at the moment they tap "Take Photo" — not at app launch.


---

## Governance Reconciliation — Effective Rules

This addendum is authoritative for future implementation after the approved governance reconciliation. Historical Stage 00.1–00.4 wording and prior decisions remain preserved as historical evidence; where a conflict exists, the later append-only reconciliation decisions control.

- Status remains PRE-IMPLEMENTATION.
- Stage 00.5 is not defined and must not be fabricated.
- Stage 01 has not begun.
- Product implementation remains unauthorized until a bounded Stage 01 Impact Analysis is approved.
- No database migration is authorized or required by this reconciliation.
- Any role, price, Draft, or compatibility migration reference is a future schema/compatibility risk only.
- If an implemented dataset is discovered before future schema work, the relevant stage must stop for a fresh compatibility and migration assessment.
- ViewState App is one Android/iOS product. Android-first is rollout priority only; iOS architectural compatibility is continuous.
- Simplicity and Speed, Capture First → Enrich Later, Private by default, Explicit sharing, and No silent loss remain mandatory.


## Governance Reconciliation — Media Safety

The approved V001 Property capability supports Photos, Videos, and Documents. Selected photos and videos must be copied or retained in app-controlled storage and must not depend only on temporary picker paths.

Property Import preserves original incoming content when extraction is incomplete or fails. Draft and share failures preserve fields, media, and source content. Storage technology, file limits, codecs, and server-backed synchronization remain deferred until a bounded Impact Analysis.