import { sourceMatch, sourceDoesNotMatch } from "./sourceAssertions";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import {
  contactPhonePresentation,
  normalizePhoneForCountry,
  phoneCountryMatches,
} from "../services/phoneEntry.ts";

test("Phone review and saved cards show the same international dialing number", () => {
  const normalized = normalizePhoneForCountry("٥٠٠٠ ٠٠٠٠", "KW");
  assert.equal(normalized, "+96550000000");
  assert.equal(
    contactPhonePresentation("٥٠٠٠ ٠٠٠٠", normalized),
    "+965 5000 0000",
  );
  assert.equal(contactPhonePresentation("5000 0000", "50000000"), "5000 0000");
  assert.equal(contactPhonePresentation("00973 12345678"), "+973 12345678");
  assert.equal(
    normalizePhoneForCountry("+966501234567", "KW"),
    "+966501234567",
  );
});

test("Country search matches localized names, ISO codes and international dial codes", () => {
  assert.equal(
    phoneCountryMatches({ code: "EG", dialCode: "20" }, "مصر", "مصر"),
    true,
  );
  assert.equal(
    phoneCountryMatches({ code: "KW", dialCode: "965" }, "الكويت", "+٩٦٥"),
    true,
  );
  assert.equal(
    phoneCountryMatches({ code: "SA", dialCode: "966" }, "السعودية", "sa"),
    true,
  );
  assert.equal(
    phoneCountryMatches({ code: "AE", dialCode: "971" }, "الإمارات", "0020"),
    false,
  );
});

test("Contact picker handles the first tap with the keyboard open and shares the saved number formatter", async () => {
  const [importer, people, person] = await Promise.all([
    readFile(
      new URL("../components/BatchContactImportModal.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/(tabs)/people.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/person/[personId].tsx", import.meta.url), "utf8"),
  ]);
  assert.match(
    importer,
    /data=\{filtered\}\s+keyboardShouldPersistTaps="handled"/,
  );
  assert.match(
    importer,
    /contactPhonePresentation\(raw, resolved\.normalizedPhone\)/,
  );
  assert.match(importer, /entries\.length === 1 && result\.imported === 1/);
  sourceMatch(
    people,
    /contactPhonePresentation\(item\.displayPhone, item\.normalizedPhone\)/,
  );
  assert.match(
    person,
    /contactPhonePresentation\(person\.displayPhone, person\.normalizedPhone\)/,
  );
});

test("Matching hides result layouts until there are results, and circle actions are presented separately", async () => {
  const [match, circle] = await Promise.all([
    readFile(new URL("../app/(tabs)/matching.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/CircleMatchingPanel.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(
    match,
    /!loading && resultGroups && !activeUnlinked && savedResults/,
  );
  assert.match(match, /completedEmpty && <View/);
  sourceMatch(
    circle,
    /<Modal\s+visible=\{tools !== null && tools !== 'invite' && detail === null\}/,
  );
  sourceMatch(circle, /circlePropertyFacts\(selectedProperty\)/);
  sourceMatch(circle, /تم نشر العقار في الدائرة/);
});
