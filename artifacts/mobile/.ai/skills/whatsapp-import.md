# ViewState AI Skill — WhatsApp & WhatsApp Business

**Read this before implementing any WhatsApp-related functionality in ViewState.**

---

## Governance Boundary — Stage 00.1 Lock

The following is locked at the product-definition level. Technical implementation details are NOT locked here — they belong to the Integration stage.

**Product-level rules:**
1. ViewState supports both **WhatsApp** and **WhatsApp Business** as required communication channel options
2. When a broker initiates a communication action from a contact or a relevant property workflow, ViewState must present a **choice between WhatsApp and WhatsApp Business**
3. The selected option opens that specific app
4. Both options are equally required — ViewState is not WhatsApp-only

**Import / capture scope:**
5. ViewState supports WhatsApp and WhatsApp Business as data **capture/import sources** (e.g., extracting contacts or leads from broker conversations)
6. The precise technical mechanism for import (deep links, intents, exported file parsing, API integration, etc.) is decided in the Integration stage — it is NOT locked here
7. Do not assume `.txt` export parsing is the only or the settled integration approach at the product level

**What is NOT in scope for V001:**
- In-app messaging (ViewState does not send or receive WhatsApp messages from within the app)
- WhatsApp Business API for automated or programmatic messaging
- Any form of WhatsApp integration beyond communication channel choice and data import/capture

---

## Communication Action — Product Behavior

When the broker taps a communication action on a contact or property:

1. ViewState presents a choice: **WhatsApp** | **WhatsApp Business**
2. The broker selects one
3. The selected app is opened (technical mechanism — deep link, intent, or equivalent — is decided in the Integration stage)
4. The broker's selection preference may optionally be remembered per contact

This applies to:
- Calling/messaging a contact directly
- Sharing a property with a contact via messaging

---

## Import Flow — Product-Level Description

ViewState supports importing contacts and potential property leads that the broker encounters through their WhatsApp or WhatsApp Business conversations.

**Product-level behavior (mechanism TBD in Integration stage):**
1. Broker initiates an import from a WhatsApp or WhatsApp Business conversation
2. ViewState extracts: contact names, phone numbers, and potential property-related information
3. Broker reviews extracted results and selects which to save
4. Broker assigns roles to contacts before saving
5. Confirmed records are saved to the database

**Privacy rule (product-level, implementation-invariant):**
- Only broker-selected contact records are ever stored
- Raw conversation content is never stored or sent to the server
- The broker is shown a clear privacy notice before any import begins

---

## Implementation Notes (Preliminary — Integration Stage Decides)

The following reflects one possible implementation approach (.txt export parsing) that may or may not be the final chosen mechanism. This is provided for planning context only — it is NOT the locked product approach.

### One possible approach: WhatsApp chat export (.txt parsing)

WhatsApp allows users to export a chat as a `.txt` file. The format varies between iOS and Android:

```
// iOS pattern
[DD/MM/YYYY, H:MM:SS AM/PM] Sender Name: message content

// Android pattern
DD/MM/YYYY, H:MM AM/PM - Sender Name: message content
```

If this approach is chosen in the Integration stage, the implementation would:
- Use `expo-document-picker` for file selection
- Parse the file on-device (privacy-first — no server involved)
- Extract contacts (sender names + phone numbers)
- Detect property-related keywords in message content
- Show results for broker review before saving

### Phone number extraction

Phone number format varies by market. Do NOT hardcode country-specific phone patterns. The market configuration provides the expected phone format and E.164 normalization rules for the active deployment market.

```typescript
// Phone pattern must come from market config — not hardcoded
// Example (illustrative only):
// const phonePattern = getMarketConfig().phonePattern;
```

### Property keyword detection

Property-related keywords should include Arabic and English terms relevant to the active market. Core terms (apartment, villa, sale, rent, etc.) are universal. Market-specific property type names may be added via market configuration.

```typescript
const basePropertyKeywords = [
  // Universal Arabic property terms
  'شقة', 'فيلا', 'أرض', 'محل', 'مكتب',
  'للبيع', 'للإيجار',
  // Universal English property terms
  'apartment', 'villa', 'land', 'shop', 'office', 'sale', 'rent',
];
// Additional market-specific terms loaded from market configuration
```

---

## Contact Extraction Rules

Regardless of technical import mechanism:

1. **Named senders / participants**: Every unique participant is a potential contact
2. **Phone numbers in content**: Scan content for phone numbers matching the market phone pattern
3. **Deduplication**: If the same phone number appears under different names, flag for broker review
4. **Minimum signal**: Only suggest a contact if they appear in ≥ 2 messages OR shared a phone number
5. **Broker review required**: No contact is saved without explicit broker selection

---

## Error States (UI — language-neutral)

| Error condition | Handling |
|----------------|---------|
| File too large | Show error in Arabic and English: "الملف كبير جداً" / "File too large" |
| Unrecognized format | Show error with re-export instructions |
| Zero contacts found | Show empty state with guidance |
| Zero phone numbers found | Show contacts by name only — let broker add phone manually |
| File read error | Show retry option |

---

## Platform Notes

- `expo-document-picker`: works on iOS and Android
- File reading: use `expo-file-system` (`FileSystem.readAsStringAsync()`)
- Large files (1000+ messages): parse in a background/chunked approach to avoid blocking the UI
- All parsing must happen on-device — never send raw conversation content to the server
