import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, Share } from "react-native";
import * as Crypto from "expo-crypto";
import { useRealAccount } from "@/contexts/RealAccountContext";
import { useUserData } from "@/contexts/UserDataContext";
import { circleInviteMessage } from "@/services/circleInvitations";
import { createCircleInviteBatch } from "@/services/circleInviteBatch";
import {
  filterInviteRecipients,
  inviteRecipientsFromContacts,
  inviteRecipientsFromPeople,
  type InviteRecipient,
} from "@/services/circleInviteRecipients";
import {
  loadInviteContacts,
  type InviteContactsState,
} from "@/services/circleInviteContacts";
import {
  listTrustCircles,
  type TrustCircle,
} from "@/services/circleMatchingApi";
import type { PhoneContactLike, PhoneCountryCode } from "@/services/phoneEntry";
import type { Person } from "@/services/people";
import { openWhatsAppComposeWithOpener } from "@/services/whatsappCompose";

export function useCircleInviteComposer(
  initialCircleId?: string,
  person?: Person,
  language = "ar",
) {
  const account = useRealAccount(),
    { store, storage } = useUserData();
  const owner = account?.profile.user_id ?? "";
  const ownerRef = useRef(owner);
  ownerRef.current = owner;
  const accountRef = useRef(account);
  accountRef.current = account;
  const lifetime = useMemo(() => ({ active: true }), [owner, store, storage]);
  const assertActive = () => {
    if (!lifetime.active || ownerRef.current !== owner)
      throw Error("ACCOUNT_CHANGED");
    accountRef.current?.assertActive?.();
  };
  const L = (ar: string, en: string) => (language === "ar" ? ar : en);
  const session = useMemo(
    () =>
      account
        ? createCircleInviteBatch({
            owner,
            storage,
            request: async (path, options) => {
              assertActive();
              const response = await accountRef.current!.request(path, options);
              assertActive();
              return response;
            },
            assertActive,
            randomId: Crypto.randomUUID,
            randomToken: () =>
              Array.from(Crypto.getRandomBytes(32), (byte) =>
                byte.toString(16).padStart(2, "0"),
              ).join(""),
          })
        : null,
    [owner, storage, lifetime],
  );
  const [loadedOwner, setLoadedOwner] = useState<string>();
  const [circles, setCircles] = useState<TrustCircle[]>([]),
    [circleId, setCircleId] = useState(initialCircleId ?? "");
  const [people, setPeople] = useState<Person[]>([]),
    [contacts, setContacts] = useState<PhoneContactLike[]>([]);
  const [contactsState, setContactsState] = useState<
    InviteContactsState | "idle" | "loading"
  >("idle");
  const [loadError, setLoadError] = useState(false),
    [peopleError, setPeopleError] = useState(false);
  const [source, setSource] = useState<"people" | "phone">("people"),
    [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, InviteRecipient>>({});
  const [country, setCountry] = useState<PhoneCountryCode>("KW"),
    [manualPhone, setManualPhone] = useState("");
  const [stage, setStage] = useState<"select" | "review">("select");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [appResults, setAppResults] = useState<
    Record<string, "accepted" | "rate_limited">
  >({});
  const [messages, setMessages] = useState<Record<string, string>>({}),
    [opened, setOpened] = useState<Record<string, boolean>>({});
  const flight = useRef(false),
    contactsFlight = useRef(false);
  const pendingAppAttempts = useRef(new Set<string>());
  async function load() {
    if (!account) {
      setLoadedOwner(owner);
      return;
    }
    setLoadError(false);
    setPeopleError(false);
    const results = await Promise.allSettled([
      listTrustCircles(account.request),
      store.getPeople(),
    ]);
    try {
      assertActive();
      if (results[0].status === "fulfilled") {
        const owned = results[0].value.filter(
          (circle) => circle.owner_id === owner,
        );
        setCircles(owned);
        setCircleId((current) =>
          owned.some((circle) => circle.id === current)
            ? current
            : owned.length === 1
              ? owned[0].id
              : "",
        );
      } else setLoadError(true);
      if (results[1].status === "fulfilled") setPeople(results[1].value);
      else setPeopleError(true);
      setLoadedOwner(owner);
    } catch {}
  }
  useEffect(() => {
    lifetime.active = true;
    setCircles([]);
    setPeople([]);
    setContacts([]);
    setContactsState("idle");
    setSource("people");
    setQuery("");
    setSelected(
      person
        ? Object.fromEntries(
            inviteRecipientsFromPeople([person])
              .filter((row) => row.phone)
              .map((row) => [row.phone!, row]),
          )
        : {},
    );
    setAppResults({});
    setMessages({});
    setOpened({});
    setStage("select");
    setBusy(false);
    setError("");
    flight.current = false;
    pendingAppAttempts.current.clear();
    contactsFlight.current = false;
    void load();
    return () => {
      lifetime.active = false;
    };
  }, [lifetime]);
  async function loadContacts() {
    if (contactsFlight.current) return;
    contactsFlight.current = true;
    setContactsState("loading");
    try {
      const result = await loadInviteContacts(Platform.OS, assertActive);
      assertActive();
      setContacts(result.contacts);
      setContactsState(result.state);
    } catch {
    } finally {
      if (lifetime.active) contactsFlight.current = false;
    }
  }
  function chooseSource(next: "people" | "phone") {
    if (flight.current) return;
    setSource(next);
    setQuery("");
    if (next === "phone" && contactsState === "idle") void loadContacts();
  }
  function toggle(row: InviteRecipient) {
    if (flight.current || !row.phone) return;
    const phone = row.phone;
    if (!selected[phone] && Object.keys(selected).length >= 50)
      setError(
        L(
          "تقدر تختار حتى 50 رقمًا في الدفعة.",
          "Choose up to 50 numbers per batch.",
        ),
      );
    setSelected((current) => {
      if (current[phone]) {
        const next = { ...current };
        delete next[phone];
        return next;
      }
      return Object.keys(current).length >= 50
        ? current
        : { ...current, [phone]: row };
    });
  }
  function addManual() {
    if (flight.current) return;
    const row = inviteRecipientsFromContacts(
      [{ name: manualPhone, phoneNumbers: [{ number: manualPhone }] }],
      country,
    )[0];
    if (!row?.phone) {
      setError(
        L(
          "راجع الرقم وكود الدولة قبل الإضافة.",
          "Review the number and dialing country.",
        ),
      );
      return;
    }
    if (!selected[row.phone]) toggle(row);
    setManualPhone("");
  }
  function chooseCircle(next: string) {
    if (flight.current) return;
    setCircleId(next);
    setAppResults({});
    setMessages({});
    setOpened({});
    setError("");
  }
  async function perform(work: () => Promise<void>) {
    try {
      assertActive();
    } catch {
      return;
    }
    if (flight.current || !account || !session) return;
    if (!circleId || !circles.some((circle) => circle.id === circleId)) {
      setError(L("اختر الدائرة أولًا.", "Choose a circle first."));
      return;
    }
    flight.current = true;
    setBusy(true);
    setError("");
    try {
      assertActive();
      await work();
      assertActive();
    } catch {
      if (lifetime.active && ownerRef.current === owner)
        setError(
          L(
            "ما اكتملت العملية. اختياراتك محفوظة هنا؛ جرّب مرة ثانية. فتح واتساب لا يؤكد إرسال الرسالة.",
            "The action did not complete. Your selections are kept here; retry. Opening WhatsApp does not confirm sending.",
          ),
        );
    } finally {
      if (lifetime.active && ownerRef.current === owner) {
        flight.current = false;
        setBusy(false);
      }
    }
  }
  async function sendApp(retryLimited = false) {
    return perform(async () => {
      const phones = Object.keys(selected).filter((phone) =>
        retryLimited
          ? appResults[phone] === "rate_limited"
          : appResults[phone] === undefined,
      );
      if (!phones.length) return;
      const attempt = JSON.stringify([circleId, [...phones].sort()]);
      const fresh = !pendingAppAttempts.current.has(attempt);
      pendingAppAttempts.current.add(attempt);
      const result = await session!.sendApp(circleId, phones, fresh);
      assertActive();
      setAppResults((current) => ({
        ...current,
        ...Object.fromEntries(
          result.results.map((row) => [row.phone, row.status]),
        ),
      }));
      pendingAppAttempts.current.delete(attempt);
    });
  }
  async function whatsapp(row: InviteRecipient) {
    if (!row.phone || !selected[row.phone]) return;
    return perform(async () => {
      const link = await session!.prepareWhatsApp(circleId, row.phone!);
      assertActive();
      const circle = circles.find((circle) => circle.id === circleId)!;
      const message = circleInviteMessage(
        account!.profile.display_name,
        circle.name,
        link,
        language,
      );
      setMessages((current) => ({ ...current, [row.phone!]: message }));
      await openWhatsAppComposeWithOpener(
        `phone=${encodeURIComponent(row.phone!.slice(1))}&text=${encodeURIComponent(message)}`,
        Linking,
      );
      assertActive();
      setOpened((current) => ({ ...current, [row.phone!]: true }));
    });
  }
  async function share(phone: string) {
    if (!messages[phone]) return;
    return perform(async () => {
      await Share.share({ message: messages[phone] });
      assertActive();
    });
  }
  const rows = useMemo(
    () =>
      source === "people"
        ? inviteRecipientsFromPeople(people, country)
        : inviteRecipientsFromContacts(contacts, country),
    [source, people, contacts, country],
  );
  return {
    account,
    ready: loadedOwner === owner,
    loadError,
    peopleError,
    load,
    circles,
    circleId,
    chooseCircle,
    source,
    chooseSource,
    contactsState,
    loadContacts,
    rows: filterInviteRecipients(rows, query),
    query,
    setQuery,
    selected,
    toggle,
    chosen: Object.values(selected),
    country,
    setCountry,
    manualPhone,
    setManualPhone,
    addManual,
    stage,
    setStage,
    busy,
    error,
    setError,
    sendApp,
    whatsapp,
    share,
    appResults,
    messages,
    opened,
  };
}
