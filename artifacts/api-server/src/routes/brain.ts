import { File } from "node:buffer";
import { Router, type IRouter, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { openai } from "@workspace/integrations-openai-ai-server";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
]);

const intentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intent",
    "originalQuery",
    "propertyType",
    "commercialActivity",
    "purpose",
    "areaTerms",
    "budgetMin",
    "budgetMax",
    "personTerms",
  ],
  properties: {
    intent: {
      type: "string",
      enum: [
        "property_search",
        "people_requirements_search",
        "find_matches",
        "unknown",
      ],
    },
    originalQuery: { type: "string" },
    propertyType: {
      type: ["string", "null"],
      enum: ["apartment", "villa", "chalet", "shop", "office", "floor", null],
    },
    commercialActivity: { type: ["string", "null"] },
    purpose: { type: ["string", "null"], enum: ["rent", "buy", null] },
    areaTerms: { type: ["array", "null"], items: { type: "string" } },
    budgetMin: { type: ["number", "null"], minimum: 0 },
    budgetMax: { type: ["number", "null"], minimum: 0 },
    personTerms: { type: ["array", "null"], items: { type: "string" } },
  },
} as const;

type BrainIntent = {
  intent:
    | "property_search"
    | "people_requirements_search"
    | "find_matches"
    | "unknown";
  originalQuery: string;
  propertyType?: string;
  commercialActivity?: string;
  purpose?: string;
  areaTerms?: string[];
  budgetMin?: number;
  budgetMax?: number;
  personTerms?: string[];
};

type StructuredIntent = Omit<BrainIntent, "propertyType" | "commercialActivity" | "purpose" | "areaTerms" | "budgetMin" | "budgetMax" | "personTerms"> & {
  propertyType: string | null;
  commercialActivity: string | null;
  purpose: string | null;
  areaTerms: string[] | null;
  budgetMin: number | null;
  budgetMax: number | null;
  personTerms: string[] | null;
};

const router: IRouter = Router();
const requestWindows = new Map<string, { count: number; resetAt: number }>();

function limited(maxRequests: number) {
  return (req: Request, res: Response, next: () => void): void => {
    const origin = req.get("origin");
    const trustedDevOrigin = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : undefined;
    if (origin && origin !== trustedDevOrigin) {
      res.status(403).json({ error: "Origin is not allowed." });
      return;
    }
    const now = Date.now();
    const key = `${req.ip}:${req.path}`;
    const current = requestWindows.get(key);
    const window = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + 60_000 }
      : current;
    window.count += 1;
    requestWindows.set(key, window);
    if (window.count > maxRequests) {
      res.status(429).json({ error: "Too many requests. Try again shortly." });
      return;
    }
    next();
  };
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, callback) => {
    callback(null, ALLOWED_AUDIO_TYPES.has(file.mimetype));
  },
});

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function parseIntentRequest(body: unknown): { text: string; locale: "ar" | "en" } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const { text, locale } = body as Record<string, unknown>;
  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > 4_000 ||
    (locale !== "ar" && locale !== "en")
  ) {
    return null;
  }
  return { text, locale };
}

function parseStructuredIntent(value: unknown, originalQuery: string): BrainIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = value as Partial<StructuredIntent>;
  const intent = parsed.intent;
  const validIntent =
    intent === "property_search" ||
    intent === "people_requirements_search" ||
    intent === "find_matches" ||
    intent === "unknown";
  const validTextArray = (terms: unknown): terms is string[] | null =>
    terms === null || (Array.isArray(terms) && terms.every((term) => typeof term === "string"));
  const validOptionalString = (term: unknown): term is string | null =>
    term === null || typeof term === "string";
  const validOptionalBudget = (budget: unknown): budget is number | null =>
    budget === null || (typeof budget === "number" && Number.isFinite(budget) && budget >= 0);

  if (
    !validIntent ||
    typeof parsed.originalQuery !== "string" ||
    !validOptionalString(parsed.propertyType) ||
    !validOptionalString(parsed.commercialActivity) ||
    !validOptionalString(parsed.purpose) ||
    !validTextArray(parsed.areaTerms) ||
    !validTextArray(parsed.personTerms) ||
    !validOptionalBudget(parsed.budgetMin) ||
    !validOptionalBudget(parsed.budgetMax) ||
    (parsed.budgetMin !== null &&
      parsed.budgetMax !== null &&
      parsed.budgetMin > parsed.budgetMax)
  ) {
    return null;
  }

  const result: BrainIntent = { intent, originalQuery };
  if (parsed.propertyType !== null) result.propertyType = parsed.propertyType;
  if (parsed.commercialActivity !== null) result.commercialActivity = parsed.commercialActivity;
  if (parsed.purpose !== null) result.purpose = parsed.purpose;
  if (parsed.areaTerms !== null) result.areaTerms = parsed.areaTerms;
  if (parsed.budgetMin !== null) result.budgetMin = parsed.budgetMin;
  if (parsed.budgetMax !== null) result.budgetMax = parsed.budgetMax;
  if (parsed.personTerms !== null) result.personTerms = parsed.personTerms;
  return canonicalizeStructuredIntent(result);
}

/**
 * This is the narrow trust boundary for model-created structured fields.
 * Property class words are not business activities, and explicit Match All
 * wording must use the local deterministic matching path.
 */
function canonicalizeStructuredIntent(result: BrainIntent): BrainIntent {
  const query = normalizeIntentText(result.originalQuery);
  const isShopQuery = /(?:^| )(?:shop|shops|محل|محلا|محلات)(?=$| )/.test(query);
  const isExplicitMatchQuery = isExplicitMatchingPhrase(query);
  const isPeopleRequirementsQuery = isPeopleRequirementsPhrase(query);
  const canonical: BrainIntent = {
    ...result,
    ...(isExplicitMatchQuery
      ? { intent: "find_matches" as const }
      : isShopQuery && isPeopleRequirementsQuery
        ? { intent: "people_requirements_search" as const }
        : {}),
    ...(isShopQuery ? { propertyType: "shop" } : {}),
  };
  if (isShopQuery && (!result.commercialActivity
    || !activityAppearsInQuery(result.commercialActivity, query))) {
    delete canonical.commercialActivity;
  }
  return canonical;
}

function normalizeIntentText(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[ىی]/g, "ي")
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isExplicitMatchingPhrase(query: string): boolean {
  return /(?:^| )(?:find matches|find match|match all|matching all)(?=$| )/.test(query)
    || /(?:^| )(?:طابق|مطابقة|المطابقات|المطابقه)(?=$| )/.test(query);
}

function isPeopleRequirementsPhrase(query: string): boolean {
  return /(?:^| )(?:people|clients?) (?:looking for|who need|that need|needing)/.test(query)
    || /(?:^| )ابحث عن عملاء يطلبون(?=$| )/.test(query);
}

function activityAppearsInQuery(activity: string, query: string): boolean {
  const normalizedActivity = normalizeIntentText(activity);
  if (/^(?:shop|shops|محل|محلا|محلات)$/.test(normalizedActivity)) return false;
  const activityTokens = normalizedActivity.split(" ").filter(Boolean);
  const queryTokens = new Set(query.split(" "));
  return activityTokens.length > 0 && activityTokens.every(token => queryTokens.has(token));
}

function isClientProviderError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

router.post("/brain/intent", limited(20), async (req: Request, res: Response) => {
  const request = parseIntentRequest(req.body);
  if (!request) {
    badRequest(res, "text must be a non-empty string and locale must be 'ar' or 'en'.");
    return;
  }

  try {
    const completion = await openai.responses.create({
      model: "gpt-5.4-mini",
      instructions:
        "Classify the user's real-estate search request in Arabic or English. " +
        "You receive only the user's query, never application data. " +
        "Choose exactly one intent. Extract only information explicitly stated. " +
        "A Shop propertyType and commercialActivity are distinct: use propertyType only for the property class, and commercialActivity only for an explicitly stated business activity. " +
        "Use null for absent optional values. Keep area and person terms in the user's language.",
      input: request.text,
      text: {
        format: {
          type: "json_schema",
          name: "viewstate_brain_intent",
          strict: true,
          schema: intentSchema,
        },
      },
    });
    const intent = parseStructuredIntent(JSON.parse(completion.output_text), request.text);
    if (!intent) {
      res.status(422).json({ error: "The request could not be classified." });
      return;
    }
    res.json(intent);
  } catch (error) {
    if (error instanceof SyntaxError) {
      res.status(422).json({ error: "The request could not be classified." });
      return;
    }
    res.status(isClientProviderError(error) ? 422 : 502).json({
      error: isClientProviderError(error)
        ? "The request could not be classified."
        : "The AI service is unavailable.",
    });
  }
});

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "audio/mpeg") return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") return "wav";
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/ogg" || mimeType === "audio/opus") return "ogg";
  if (mimeType === "audio/flac") return "flac";
  if (mimeType === "audio/aac") return "aac";
  return "m4a";
}

async function transcribe(req: Request, res: Response): Promise<void> {
  const audio = req.file;
  if (!audio) {
    badRequest(res, "A supported audio file is required in the audio field.");
    return;
  }

  try {
    const bytes = new Uint8Array(audio.buffer.byteLength);
    bytes.set(audio.buffer);
    const file = new File([bytes], `recording.${extensionForMimeType(audio.mimetype)}`, {
      type: audio.mimetype,
    });
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
    });
    if (!transcription.text.trim()) {
      res.status(422).json({ error: "The audio could not be transcribed." });
      return;
    }
    res.json({ transcript: transcription.text });
  } catch (error) {
    res.status(isClientProviderError(error) ? 422 : 502).json({
      error: isClientProviderError(error)
        ? "The audio could not be transcribed."
        : "The AI service is unavailable.",
    });
  }
}

router.post("/brain/transcribe", limited(6), (req, res, next) => {
  if (!req.is("multipart/form-data")) {
    badRequest(res, "Content-Type must be multipart/form-data.");
    return;
  }
  upload.single("audio")(req, res, (error: unknown) => {
    if (error) {
      if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "Audio must not exceed 8 MB." });
        return;
      }
      badRequest(res, "Provide one supported audio file in the audio field.");
      return;
    }
    void transcribe(req, res).catch(next);
  });
});

export default router;