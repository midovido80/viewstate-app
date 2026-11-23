import { KUWAIT_AREAS, KUWAIT_AREA_ALIASES } from "@/constants/kuwait-areas";
import type { PropertyDetailField } from "@workspace/property-domain";

/** Suggestions only. No business record, person or permission is created by parsing. */
export interface ImportFacts {
  intent?: "offered" | "wanted";
  transaction?: "rent" | "sale";
  choice?: string;
  areaIds: string[];
  allKuwait?: boolean;
  price?: number;
  minimum?: number;
  period?: "daily" | "monthly" | "yearly";
  block?: string;
  details: Partial<Record<PropertyDetailField, string>>;
  areaSquareMeters?: number;
  warnings: string[];
}
export const importWarningCopy: Record<string, [string, string]> = {
  ocr: [
    "النص من صورة وقد تُقرأ الأرقام بشكل غير صحيح؛ راجع السعر والأعداد مع الصورة الأصلية.",
    "Image OCR can misread numbers. Check price and counts against the original image.",
  ],
  intent: [
    "أكد هل الرسالة عرض أم طلب عميل.",
    "Confirm offer or client request.",
  ],
  transaction: [
    "أكد الإيجار أو البيع؛ المعاملة غير واضحة.",
    "Confirm rent or sale; the transaction is unclear.",
  ],
  type: ["أكد نوع العقار؛ النوع غير واضح.", "Confirm the property type."],
  areas: [
    "وردت مناطق متعددة؛ أكد المنطقة المناسبة.",
    "Several areas were mentioned; confirm the area.",
  ],
  price: [
    "السعر ناقص أو متعدد؛ راجعه مع مدة الإيجار والعملة.",
    "Price is missing or ambiguous; review amount, currency and rental period.",
  ],
  period: [
    "مدة الإيجار غير مذكورة؛ أكدها قبل المتابعة.",
    "Rental period is missing; confirm it before continuing.",
  ],
  currency: [
    "وردت عملة غير الدينار الكويتي؛ أدخل القيمة الصحيحة بنفسك.",
    "A non-KWD currency was mentioned; enter the correct amount yourself.",
  ],
  numbers: [
    "وردت أعداد أو مواصفات متعارضة؛ راجع الرسالة.",
    "Conflicting specifications; review the original message.",
  ],
  link: [
    "الرابط مرجع فقط؛ لم نجلب محتواه.",
    "Link retained as a reference; its content was not fetched.",
  ],
};
export function normalizeImportText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[\u064b-\u065fـ]/g, "")
    .toLowerCase();
}
const numberValue = (s: string) =>
  Number(s.replace(/[,٬]/g, "").replace(/٫/g, "."));
const unique = <T>(values: T[]) => [...new Set(values)];
const letterOrDigit = /[\p{L}\p{N}]/u;
const token = (text: string, phrase: string) => {
  for (
    let at = text.indexOf(phrase);
    at >= 0;
    at = text.indexOf(phrase, at + 1)
  ) {
    const before = text[at - 1],
      after = text[at + phrase.length];
    const left =
      !before ||
      !letterOrDigit.test(before) ||
      (before === "ب" && (!text[at - 2] || !letterOrDigit.test(text[at - 2])));
    if (left && (!after || !letterOrDigit.test(after))) return true;
  }
  return false;
};
const N = "(\\d+(?:[,.٬٫]\\d+)*)";

export function analyzeImportMessage(raw: string): ImportFacts {
  const text = normalizeImportText(raw),
    warnings: string[] = [];
  const wanted =
    /مطلوب|ابحث|نبحث|طلب (?:شراء|استئجار)|looking for|wanted|seeking/.test(
      text,
    );
  const offered = /معروض|متاح|للايجار|للبيع|for rent|for sale|available/.test(
    text,
  );
  const rent = /ايجار|استئجار|للايجار|rent|lease/.test(text);
  const sale = /للبيع|شراء|للشراء|for sale|buy|purchase/.test(text);
  const facts: ImportFacts = { areaIds: [], details: {}, warnings };
  if (wanted) facts.intent = "wanted";
  else if (offered) facts.intent = "offered";
  else warnings.push("intent");
  if (rent !== sale) facts.transaction = rent ? "rent" : "sale";
  else warnings.push("transaction");
  const types: [string, RegExp][] = [
    ["studio", /استوديو|ستوديو|\bstudio\b/],
    ["duplex", /دوبلكس|دوبليكس|\bduplex\b/],
    ["villa", /فيلا|فيله|\bvilla\b/],
    ["house", /\bhouse\b|بيت/],
    ["chalet", /شاليه|\bchalet\b/],
    ["whole_building", /عماره|عمارة|whole building|entire building/],
    ["commercial_floor", /دور تجاري|commercial floor/],
    ["residential_floor", /دور سكني|residential floor/],
    ["commercial_complex", /مجمع تجاري|commercial complex/],
    ["office", /مكتب|\boffice\b/],
    ["shop", /محل|\bshop\b/],
    ["warehouse", /مخزن|مستودع|\bwarehouse\b/],
  ];
  const foundTypes = types.filter(([, re]) => re.test(text)).map(([v]) => v);
  if (foundTypes.length === 1) facts.choice = foundTypes[0];
  else if (!foundTypes.length && /شقه|شقة|\bapartment\b|\bflat\b/.test(text))
    facts.choice = "apartment";
  else warnings.push("type");
  const matches = KUWAIT_AREAS.filter(
    (a) =>
      token(text, normalizeImportText(a.ar)) ||
      token(text, normalizeImportText(a.en)),
  );
  const aliases = KUWAIT_AREA_ALIASES.filter((a) =>
    [a.aliasAr, a.aliasEn].some(
      (v) => v && token(text, normalizeImportText(v)),
    ),
  );
  facts.areaIds = unique([
    ...matches.map((a) => a.id),
    ...aliases.map((a) => a.canonicalAreaId),
  ]);
  if (
    wanted &&
    /كل مناطق الكويت|كل الكويت|all kuwait|any area|all areas/.test(text)
  )
    facts.allKuwait = true;
  if (facts.areaIds.length > 1) warnings.push("areas");
  const values = (pattern: RegExp, source = text) =>
    unique(
      [...source.matchAll(pattern)]
        .map((m) => numberValue(m[1]))
        .filter(Number.isFinite),
    );
  const assignCount = (field: PropertyDetailField, names: string) => {
    const countText =
      field === "bedroomCount"
        ? text.replace(
            /(?:\d+\s*)?(?:غرف(?:ه|ة)?\s+(?:ماستر|خادمه|خادمة|سائق)|master bedrooms?)(?:\s*[:：]?\s*\d+)?/gu,
            " ",
          )
        : text;
    const all = values(
      new RegExp(
        `${N}\\s*(?:${names})(?![\\p{L}])|(?:${names})\\s*[:：]?\\s*${N}`,
        "gu",
      ),
      countText,
    );
    // The second alternative's number is group 2.
    const second = [
      ...countText.matchAll(new RegExp(`(?:${names})\\s*[:：]?\\s*${N}`, "gu")),
    ].map((m) => numberValue(m[1]));
    const nums = unique(
      [...all, ...second].filter(
        (n) => Number.isInteger(n) && n >= 0 && n <= 1000,
      ),
    );
    if (nums.length === 1) facts.details[field] = String(nums[0]);
    else if (nums.length > 1) warnings.push("numbers");
  };
  assignCount("bedroomCount", "غرف نوم|غرف|غرفه|غرفة|bedrooms?|beds?");
  assignCount("bathroomCount", "حمامات|حمام|bathrooms?|baths?");
  assignCount("parkingSpaceCount", "مواقف|موقف|parking spaces?");
  assignCount("masterBedroomCount", "غرف ماستر|ماستر|master bedrooms?");
  assignCount("floorNumber", "رقم الدور|الطابق|الدور|floor number");
  // Explicit dual forms; a bare service word does not establish its count.
  for (const [field, re] of [
    ["bedroomCount", /غرفتين|غرفتان/],
    ["bathroomCount", /حمامين|حمامان/],
  ] as const) {
    if (re.test(text) && !facts.details[field]) facts.details[field] = "2";
  }
  const area = values(
    new RegExp(
      `${N}\\s*(?:متر مربع|متر|م²|م2|sqm|m²|m2|sq\\.?\\s*m)(?![\\p{L}])`,
      "gu",
    ),
  );
  if (area.length === 1 && area[0] > 0) facts.areaSquareMeters = area[0];
  else if (area.length > 1) warnings.push("numbers");
  const blocks = values(
    new RegExp(`(?:قطعه|قطعة|block)\\s*[:：]?\\s*${N}`, "gu"),
  );
  if (blocks.length === 1 && blocks[0] >= 1 && blocks[0] <= 12)
    facts.block = String(blocks[0]);
  const periods = unique(
    [
      /شهري|بالشهر|monthly|per month|\/month/.test(text) ? "monthly" : "",
      /سنوي|بالسنه|yearly|annual|per year/.test(text) ? "yearly" : "",
      /يومي|باليوم|daily|per day/.test(text) ? "daily" : "",
    ].filter(Boolean),
  );
  if (periods.length === 1) facts.period = periods[0] as ImportFacts["period"];
  if (facts.transaction === "rent" && !facts.period) warnings.push("period");
  const foreign = /ريال|درهم|دولار|جنيه|\b(?:sar|aed|usd|egp|dollar)\b|\$/.test(
    text,
  );
  const prices = unique([
    ...values(
      new RegExp(`${N}\\s*(?:د\\s*\\.?\\s*ك|دينار|kwd|kd)(?![\\p{L}])`, "gu"),
    ),
    ...values(
      new RegExp(
        `(?:السعر|الايجار|الميزانيه|الميزانية|price|rent|budget)\\s*[:：]?\\s*${N}`,
        "gu",
      ),
    ),
  ]).filter((n) => n > 0);
  const range = text.match(
    new RegExp(
      `(?:من|between|budget|الميزانيه|الميزانية)\\s*[:：]?\\s*${N}\\s*(?:دينار|د\\.?\\s*ك|kwd|kd)?\\s*(?:الي|الى|to|and|[-–])\\s*${N}`,
      "u",
    ),
  );
  if (foreign) warnings.push("currency");
  else if (
    wanted &&
    range &&
    numberValue(range[1]) > 0 &&
    numberValue(range[2]) >= numberValue(range[1])
  ) {
    facts.minimum = numberValue(range[1]);
    facts.price = numberValue(range[2]);
  } else if (prices.length === 1) facts.price = prices[0];
  else if (
    prices.length === 2 &&
    wanted &&
    /من[\s\S]{0,25}الي|between|\d\s*[-–]\s*\d/.test(text)
  ) {
    facts.minimum = Math.min(...prices);
    facts.price = Math.max(...prices);
  } else warnings.push("price");
  const features: [PropertyDetailField, string][] = [
    ["hasElevator", "مصعد|اصنصير|elevator|lift"],
    ["hasMaidRoom", "غرفه خادمه|غرفة خادمة|maid(?:s)? room"],
    ["hasCentralAC", "تكييف مركزي|central a/?c"],
    ["hasGarden", "حديقه|حديقة|garden"],
    ["hasPool", "مسبح|حمام سباحه|pool"],
    ["hasBalcony", "بلكونه|بلكونة|balcony"],
  ];
  for (const [field, words] of features) {
    const occurrences = [...text.matchAll(new RegExp(words, "gu"))];
    const vals = unique(
      occurrences.map((m) =>
        /(?:لا\s*يوجد|بدون|من\s*غير|ما\s*في(?:ه|ش)?|ماكو|مو\s*متوفر|no|without)\s*$/.test(
          text.slice(Math.max(0, m.index! - 18), m.index),
        )
          ? "false"
          : "true",
      ),
    );
    if (vals.length === 1) facts.details[field] = vals[0];
    else if (vals.length > 1) warnings.push("numbers");
  }
  if (/https?:\/\//.test(text)) warnings.push("link");
  facts.warnings = unique(warnings);
  return facts;
}

export function possibleSavedImportDuplicates(
  facts: ImportFacts,
  properties: readonly import("@workspace/property-domain").Property[],
  requirements: readonly import("@workspace/property-domain").SeekerRequirement[],
) {
  if (
    !facts.choice ||
    !facts.transaction ||
    facts.price === undefined ||
    !facts.areaIds.length
  )
    return [];
  const propertyType = ["studio", "duplex"].includes(facts.choice)
    ? "apartment"
    : ["commercial_floor", "residential_floor"].includes(facts.choice)
      ? "floor"
      : facts.choice;
  if (facts.intent === "wanted")
    return requirements
      .filter(
        (r) =>
          r.propertyType === propertyType &&
          r.purpose === (facts.transaction === "sale" ? "buy" : "rent") &&
          r.budget.maximum === facts.price &&
          r.preferredAreaIds.some((a) => facts.areaIds.includes(a)),
      )
      .map((r) => ({
        id: r.id,
        path: `/requirement/view/${encodeURIComponent(r.id)}`,
      }));
  return properties
    .filter(
      (p) =>
        p.core.propertyType === propertyType &&
        facts.areaIds.includes(p.core.locationArea.id) &&
        p.activeOffer.transaction === facts.transaction &&
        (p.activeOffer.transaction === "rent"
          ? p.activeOffer.rentalPrice?.amount
          : p.activeOffer.salePrice?.amount) === facts.price &&
        (p.activeOffer.transaction !== "rent" ||
          !facts.period ||
          p.activeOffer.rentalPeriodId === facts.period),
    )
    .map((p) => ({
      id: p.core.id,
      path: `/property/${encodeURIComponent(p.core.id)}`,
    }));
}

/** Blank-line or explicit separator split only, always reviewed before committing. */
export function suggestMessageParts(text: string): string[] {
  const parts = text
    .split(/\n\s*(?:[-ـ_=]{3,}\s*\n|\n)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 &&
    parts.every((s) =>
      /للايجار|للبيع|مطلوب|for rent|for sale|wanted|looking for/i.test(
        normalizeImportText(s),
      ),
    )
    ? parts
    : [text];
}
export function sameImportText(a: string, b: string): boolean {
  const normalize = (s: string) =>
    normalizeImportText(s).replace(/\s+/g, " ").trim();
  return !!a.trim() && normalize(a) === normalize(b);
}
