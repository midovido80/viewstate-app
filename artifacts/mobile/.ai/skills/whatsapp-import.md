# ViewState AI Skill — WhatsApp Import

**Read this before implementing any WhatsApp import functionality in ViewState.**

---

## Overview

Egyptian brokers conduct most of their business via WhatsApp. ViewState provides a way to import a WhatsApp chat export (.txt file) to extract contact names, phone numbers, and property leads mentioned in the conversation.

This feature is an **import assistant** — it extracts structured data from unstructured text. It does NOT send or receive WhatsApp messages.

---

## WhatsApp Export Format

WhatsApp exports chats as `.txt` files. The format varies slightly between iOS and Android, but follows this general pattern:

### iOS format
```
[13/8/2026, 2:30:15 PM] Ahmed Hassan: مرحبا، عندي شقة للبيع في القاهرة
[13/8/2026, 2:31:00 PM] Mohamed Ali: +201001234567 تواصل معه
[13/8/2026, 2:32:45 PM] Ahmed Hassan: المساحة 120 متر، 3 غرف
```

### Android format
```
13/8/2026, 2:30 PM - Ahmed Hassan: مرحبا، عندي شقة للبيع في القاهرة
13/8/2026, 2:31 PM - Mohamed Ali: +201001234567 تواصل معه
```

---

## Import Flow

1. Broker taps "Import from WhatsApp"
2. App shows instructions: "In WhatsApp, open the chat → ⋮ → More → Export Chat → Without Media → Save to Files"
3. Broker uses `expo-document-picker` to select the exported `.txt` file
4. App parses the file locally (no server involved — privacy-first)
5. App shows extracted results:
   - Contacts found (name + phone number)
   - Potential property mentions (keyword-based detection)
6. Broker reviews, selects which contacts to save
7. Broker can assign a role to each contact before saving
8. Save confirmed contacts to the database

---

## File Selection

```typescript
import * as DocumentPicker from 'expo-document-picker';

async function pickWhatsAppFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'text/plain',
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;
  return result.assets[0].uri;
}
```

---

## Parsing Logic

```typescript
interface ParsedMessage {
  timestamp: Date | null;
  sender: string | null;
  content: string;
}

interface ParsedContact {
  name: string;
  phone: string; // normalized E.164
  messagesCount: number;
  firstSeen: Date | null;
}

function parseWhatsAppExport(text: string): {
  messages: ParsedMessage[];
  contacts: ParsedContact[];
  propertyMentions: string[];
} {
  // iOS pattern: [DD/MM/YYYY, H:MM:SS AM/PM] Name: message
  const iosPattern = /\[(\d{1,2}\/\d{1,2}\/\d{4}), (\d{1,2}:\d{2}:\d{2} [AP]M)\] ([^:]+): (.+)/;

  // Android pattern: DD/MM/YYYY, H:MM AM/PM - Name: message
  const androidPattern = /(\d{1,2}\/\d{1,2}\/\d{4}), (\d{1,2}:\d{2} [AP]M) - ([^:]+): (.+)/;

  // Phone number extraction from message content
  const phonePattern = /(?:\+20|0)(1[0125]\d{8})/g;

  // Property keywords (Arabic + English) for detecting property mentions
  const propertyKeywords = [
    'شقة', 'فيلا', 'أرض', 'محل', 'مكتب', // Arabic
    'apartment', 'villa', 'land', 'shop', 'office', // English
    'للبيع', 'للإيجار', 'sale', 'rent', 'متر', 'غرفة', 'غرف',
  ];

  // Parse messages, extract contacts and phone numbers, detect property mentions
  // ... implementation here
}
```

---

## Contact Extraction Rules

1. **Named senders**: Every unique sender name in the chat is a potential contact
2. **Phone numbers in messages**: Scan message content for Egyptian phone numbers
3. **Deduplication**: If the same phone number appears under different names, flag for broker review
4. **Minimum signal**: Only extract a contact if they appear in ≥ 2 messages OR shared a phone number

---

## Property Mention Detection

Scan message content for property-related keywords. If found:
- Show the message as a "mention" in the import review screen
- Let the broker optionally create a property lead from the mention
- This is a soft suggestion — the broker decides what to do with each mention

---

## Privacy Rules

- File parsing happens **entirely on the device** — no chat content is ever sent to the server
- Only the selected contact records (name + phone) are sent to the server after broker review
- The original `.txt` file is deleted from the app cache after parsing (`expo-file-system`)
- The broker is shown a privacy note before starting the import

---

## Platform Notes

- `expo-document-picker`: works on iOS, Android, and web
- File reading: use `expo-file-system` (`FileSystem.readAsStringAsync()`)
- Web: `FileSystem` has partial support — test explicitly
- The `.txt` file may be large (1000+ messages) — parse in a background thread using a chunked approach to avoid blocking the UI

---

## Error Cases

| Error | Handling |
|-------|---------|
| File too large (> 5 MB) | Show error: "הקובץ גדול מדי" / "File too large" |
| Not a WhatsApp export format | Show error with instructions to re-export |
| Zero contacts found | Show empty state with tips |
| Zero phone numbers found | Show contacts by name only, let broker add phone manually |
| File read error | Show retry button |
