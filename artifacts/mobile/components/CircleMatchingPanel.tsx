import { CircleMemberAttribution } from "./CircleMemberAttribution";
import type { CircleAttribution } from "@/services/circleMemberAttribution";
import { Text } from "@/components/AppText";
import {
  CircleInvitationCard,
  type CircleInvitation,
} from "./CircleInvitationCard";
import { CircleJoinReviewPanel } from "./CircleJoinReviewPanel";
import { acceptCircleInvitation } from "@/services/circleJoinApproval";
import { CircleInviteComposer } from "./CircleInviteComposer";
import { Button } from "./Button";
import { useRouter } from "expo-router";
import { formatMatchingBudget } from "@/services/matchingPresentation";
import {
  CircleMatchDetails,
  type CircleOpportunity,
} from "./CircleMatchDetails";
import { useScreenInsets } from "@/hooks/useScreenInsets";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useIsFocused } from "@react-navigation/native";
import { CircleSharedDetails } from "./CircleSharedDetails";
import { validateSeekerRequirement } from "@workspace/property-domain";
import { Feather } from "@expo/vector-icons";
import { CompactDropdown } from "@/components/FormChoices";
import { PropertyCardContent } from "@/components/PropertyVisualSummary";
import { getPropertyCardSummary } from "@/services/cardSummaryPresentation";
import { getSavedPropertyTypeLabel } from "@/services/savedPropertyClassification";
import {
  CircleCooperationCard,
  CircleCooperationRequest,
  type Cooperation,
  type CooperationAction,
} from "./CircleCooperation";
import { CircleManageListing } from "./CircleManageListing";
import { useUserData } from "@/contexts/UserDataContext";
import {
  changeListingStatus,
  type ListingStatus,
} from "@/services/propertyLifecycle";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  Share,
  Switch,
  View,
} from "react-native";
import * as Crypto from "expo-crypto";
import type {
  MatchResult,
  Property,
  SeekerRequirement,
} from "@workspace/property-domain";
import {
  Action,
  AssistantField,
  AssistantText,
} from "@/components/assistant/ui";
import { useI18n } from "@/contexts/I18nContext";
import { useColors } from "@/hooks/useColors";
import { getAreaById } from "@/constants/kuwait-areas";
import { formatPrice, formatRentalPrice } from "@/constants/market";
import {
  CircleMatchingSource,
  type SharedCircleProperty,
} from "@/services/circleMatchingSource";
import { BrokerInitiatedMatching } from "@/services/brokerInitiatedMatching";
import {
  circlePropertyFacts,
  circleRequestFacts,
  circleRpc,
  listTrustCircles,
  publishCircleProperty,
  setCircleRequirementMatching,
  type TrustCircle,
} from "@/services/circleMatchingApi";
import { setCirclePush } from "@/services/circlePush";
import type { CloudRequest } from "@/services/workspaceCloud";

type Circle = TrustCircle;
type Invitation = CircleInvitation;
type AutomaticMatch = {
  id: string;
  request_id: string;
  property_id: string;
  score: number;
};
type SharedRequest = {
  id: string;
  local_id: string | null;
  type: string;
  purpose: string;
};
type MatchScope =
  { kind: "request" | "property"; id: string } | { kind: "all" };
type Listing = { row: SharedCircleProperty; property: Property };
type CircleTool =
  "create" | "invite" | "publish" | "match" | "matchProperty" | "notifications";
const userIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

interface Props {
  request: CloudRequest;
  owner: string;
  properties: readonly Property[];
  requirements: readonly SeekerRequirement[];
  initialMatch?: MatchScope;
  initialCircleId?: string;
  noticeKind?: string;
  noticeTargetId?: string;
  fullScreen?: boolean;
  initialCreate?: boolean;
}

export function CircleMatchingPanel({
  request,
  owner,
  properties,
  requirements,
  initialMatch,
  initialCircleId,
  noticeKind,
  noticeTargetId,
  fullScreen = false,
  initialCreate = false,
}: Props) {
  const { language, t, fonts, isRTL } = useI18n();
  const colors = useColors();
  const insets = useScreenInsets();
  const { store, storage } = useUserData();
  const focused = useIsFocused();
  const [detail, setDetail] = useState<
    | { kind: "property"; id: string }
    | { kind: "request"; id: string; request: SeekerRequirement }
    | { kind: "preview"; property: Property }
    | null
  >(null);
  const [managed, setManaged] = useState<Listing | null>(null);
  const ar = language === "ar";
  const L = (arabic: string, english: string) => (ar ? arabic : english);
  const api = useRef(request);
  api.current = request;
  const rpc = useCallback(
    <T,>(name: `vs_circle_${string}`, params = {}) =>
      circleRpc<T>(api.current, name, params),
    [],
  );
  const active = useRef(false);
  const flight = useRef(false);
  const polling = useRef<Promise<void> | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cooperations, setCooperations] = useState<Cooperation[]>([]);
  const [focusedCooperation, setFocusedCooperation] = useState<string | null>(
    null,
  );
  const [cooperationMatch, setCooperationMatch] = useState<string | null>(null);
  const [sharedRequests, setSharedRequests] = useState<SharedRequest[]>([]);
  const [serverProcessing, setServerProcessing] = useState(false);
  const [matchScope, setMatchScope] = useState<MatchScope | null>(null);
  const [automatic, setAutomatic] = useState<AutomaticMatch[]>([]);
  const [section, setSection] = useState<
    "opportunities" | "properties" | "requests" | "members"
  >("opportunities");
  const [members, setMembers] = useState<
    {
      user_id: string;
      display_name: string;
      company: string;
      state: string;
      is_owner: boolean;
    }[]
  >([]);
  const [attribution, setAttribution] = useState<CircleAttribution>({
    members: [],
    requests: [],
    matches: [],
  });
  const memberFor = (id?: string) =>
    attribution.members.find((member) => member.user_id === id);
  const matchMember = (id: string) => {
    const match = attribution.matches.find((item) => item.id === id);
    return memberFor(
      match?.publisher === owner ? match.requester : match?.publisher,
    );
  };
  const [membersFailed, setMembersFailed] = useState(false);
  const [lastChecked, setLastChecked] = useState<string>();
  const [opportunity, setOpportunity] = useState<CircleOpportunity>();
  const [results, setResults] = useState<
    readonly (MatchResult & { requirementId: string })[] | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failureReason, setFailureReason] = useState("");
  const [done, setDone] = useState("");
  const failureMessage =
    failureReason === "CIRCLE_COOPERATION_COOLDOWN"
      ? L(
          "تم رفض طلب التعاون السابق. تقدر ترسل طلبًا جديدًا لنفس الفرصة بعد 24 ساعة من الرفض.",
          "The previous cooperation request was declined. You can request this opportunity again 24 hours after the decline.",
        )
      : failureReason === "CIRCLE_MEMBER_REQUEST_LIMIT"
        ? L(
            "وصلت حدك: 200 طلب مشاركة في هالدائرة. أوقف مطابقة طلب سابق عشان تضيف طلبًا جديدًا.",
            "You have reached 200 shared requests in this circle. Pause an existing request to add another.",
          )
        : failureReason === "CIRCLE_REQUEST_LIMIT"
          ? L(
              "الدائرة وصلت حد 2000 طلب مشاركة. تقدر تعدّل طلباتك الحالية أو توقف مطابقتها.",
              "This circle has reached 2000 shared requests. You can still edit or pause your existing requests.",
            )
          : L(
              "تعذّر تنفيذ الإجراء. حاول مرة أخرى.",
              "Could not complete this action. Try again.",
            );
  const [name, setName] = useState("");
  const router = useRouter();
  const [tools, setTools] = useState<CircleTool | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  );
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(
    null,
  );
  const selectedRequest = requirements.find(
    (requirement) => requirement.id === selectedRequestId,
  );
  const selectedProperty = properties.find(
    (property) => property.core.id === selectedPropertyId,
  );

  const refresh = useCallback(async () => {
    const [nextCircles, nextInvitations] = await Promise.all([
      listTrustCircles(api.current),
      rpc<Invitation[]>("vs_circle_invitations_named"),
    ]);
    if (active.current) {
      setCircles(nextCircles);
      setInvitations(nextInvitations);
    }
    return nextCircles;
  }, [rpc]);

  const perform = useCallback(
    async (work: () => Promise<void>, doneMessage?: string) => {
      if (flight.current) return;
      flight.current = true;
      setBusy(true);
      setFailed(false);
      setFailureReason("");
      setDone("");
      try {
        await polling.current;
        if (!active.current) return;
        await work();
        if (active.current && doneMessage) setDone(doneMessage);
      } catch (error) {
        if (active.current) {
          setListings([]);
          setResults(null);
          setAutomatic([]);
          setCooperations([]);
          setManaged(null);
          setDetail(null);
          setOpportunity(undefined);
          setMembers([]);
          setCooperationMatch(null);
          setFailed(true);
          setFailureReason(error instanceof Error ? error.message : "");
        }
      } finally {
        flight.current = false;
        if (active.current) setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    active.current = true;
    void perform(async () => {
      const available = await refresh();
      if (initialCreate && active.current) setTools("create");
      const remembered = await storage.getItem("@viewstate/circle/selected");
      const initialCircle =
        available.find((circle) => circle.id === initialCircleId) ??
        available.find((circle) => circle.id === remembered) ??
        available[0];
      if (active.current && initialCircle) {
        await loadRef.current(initialCircle, initialMatch);
        if (
          initialCircle.id !== initialCircleId ||
          !noticeTargetId ||
          !active.current
        )
          return;
        if (noticeKind === "listing") {
          setSection("properties");
          setDetail({ kind: "property", id: noticeTargetId });
        }
        if (noticeKind === "match")
          await openMatchOpportunity(initialCircle.id, noticeTargetId);
        if (noticeKind === "cooperation") setFocusedCooperation(noticeTargetId);
        if (noticeKind === "requirement")
          await openSharedRequirement(initialCircle.id, noticeTargetId);
      }
    });
    return () => {
      active.current = false;
    };
  }, [
    perform,
    refresh,
    initialCircleId,
    noticeKind,
    noticeTargetId,
    initialCreate,
  ]);

  async function loadCircle(circle: Circle, scope?: MatchScope, quiet = false) {
    const [rows, workspace, history, nextAttribution] = await Promise.all([
      rpc<SharedCircleProperty[]>("vs_circle_catalog", { p_circle: circle.id }),
      rpc<{
        requests: SharedRequest[];
        matches: AutomaticMatch[];
        processing?: boolean;
      }>("vs_circle_matching_workspace", { p_circle: circle.id }),
      rpc<Cooperation[]>("vs_circle_cooperation_list", { p_circle: circle.id }),
      rpc<CircleAttribution>("vs_circle_attribution", { p_circle: circle.id }),
    ]);
    const source = new CircleMatchingSource(async () => rows);
    const candidates = await source.getCandidates();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const { requests, matches } = workspace;
    const propertyId =
      scope?.kind === "property"
        ? rows.find(
            (row) =>
              row.id === scope.id ||
              (row.publisher_id === owner && row.source_key === scope.id),
          )?.id
        : undefined;
    const matchCandidates =
      scope?.kind === "property"
        ? candidates.filter(
            (candidate) => candidate.property.core.id === propertyId,
          )
        : candidates;
    const localRequests = requirements.filter(
      (requirement) =>
        circleRequestFacts(requirement) &&
        (scope?.kind !== "request" || scope.id === requirement.id),
    );
    const excluded = rows
      .filter((row) => row.publisher_id === owner)
      .map((row) => row.id);
    const localResults = scope
      ? await Promise.all(
          localRequests.map(async (requirement) => {
            const service = new BrokerInitiatedMatching(
              { getRequirement: async () => requirement },
              { getCandidates: async () => matchCandidates },
            );
            const run = await service.runForRequirement(
              requirement.id,
              { strictFields: ["location"] },
              excluded,
            );
            return run.matches.map((result) => ({
              ...result,
              requirementId: requirement.id,
            }));
          }),
        )
      : null;
    if (!active.current) return;
    setAttribution(nextAttribution);
    setSelected(circle);
    void storage
      .setItem("@viewstate/circle/selected", circle.id)
      .catch(() => undefined);
    setListings(
      candidates.map(({ property }) => ({
        property,
        row: byId.get(property.core.id)!,
      })),
    );
    setAutomatic(matches);
    setOpportunity((current) => {
      const match = current && matches.find((item) => item.id === current.id);
      const property =
        match &&
        candidates.find((item) => item.property.core.id === match.property_id)
          ?.property;
      return current && property ? { ...current, property } : undefined;
    });
    setServerProcessing(workspace.processing === true);
    setLastChecked(new Date().toISOString());
    setSharedRequests(requests);
    setCooperations(history);
    setManaged((current) => {
      if (!current) return null;
      const row = byId.get(current.row.id);
      return row ? { ...current, row } : null;
    });
    if (!quiet) setMatchScope(scope ?? null);
    if (!quiet || scope) setResults(localResults?.flat() ?? null);
    setDetail((current) =>
      current?.kind === "request" &&
      !matches.some((match) => match.id === current.id)
        ? null
        : current,
    );
  }

  const loadRef = useRef(loadCircle);
  loadRef.current = loadCircle;
  useEffect(() => {
    if (!focused) return;
    const refreshActive = () => {
      if (
        AppState.currentState === "background" ||
        flight.current ||
        polling.current
      )
        return;
      polling.current = (async () => {
        try {
          const available = await refresh();
          if (!active.current) return;
          const circle = selected
            ? available.find((item) => item.id === selected.id)
            : available.length === 1
              ? available[0]
              : undefined;
          if (circle)
            await loadRef.current(
              circle,
              selected ? (matchScope ?? undefined) : initialMatch,
              true,
            );
          else if (selected) {
            setSelected(null);
            setListings([]);
            setAutomatic([]);
            setSharedRequests([]);
            setCooperations([]);
            setMatchScope(null);
            setResults(null);
            setManaged(null);
            setDetail(null);
            setOpportunity(undefined);
            setMembers([]);
          }
        } catch {
          if (active.current) {
            setFailed(true);
            setOpportunity(undefined);
            setMembers([]);
          }
        } finally {
          polling.current = null;
        }
      })();
    };
    void refreshActive();
    const timer = setInterval(
      () => void refreshActive(),
      serverProcessing ? 3_000 : 30_000,
    );
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshActive();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [focused, selected?.id, refresh, matchScope, serverProcessing]);

  async function openSharedRequirement(circleId: string, matchId: string) {
    const facts = await rpc<Record<string, unknown> | null>(
      "vs_circle_match_requirement",
      { p_circle: circleId, p_match: matchId },
    );
    const requirement = facts && { ...facts, id: matchId, notes: "" };
    if (!requirement || !validateSeekerRequirement(requirement).ok)
      throw new Error("CIRCLE_REQUEST_UNAVAILABLE");
    if (active.current)
      setDetail({
        kind: "request",
        id: matchId,
        request: requirement as SeekerRequirement,
      });
  }

  async function openMatchOpportunity(circleId: string, matchId: string) {
    const [facts, workspace, rows, nextAttribution] = await Promise.all([
      rpc<Record<string, unknown> | null>("vs_circle_match_requirement", {
        p_circle: circleId,
        p_match: matchId,
      }),
      rpc<{ matches: AutomaticMatch[] }>("vs_circle_matching_workspace", {
        p_circle: circleId,
      }),
      rpc<SharedCircleProperty[]>("vs_circle_catalog", { p_circle: circleId }),
      rpc<CircleAttribution>("vs_circle_attribution", { p_circle: circleId }),
    ]);
    const match = workspace.matches.find((item) => item.id === matchId);
    const requirement = facts && { ...facts, id: matchId, notes: "" };
    const candidates = await new CircleMatchingSource(
      async () => rows,
    ).getCandidates();
    const property = candidates.find(
      (item) => item.property.core.id === match?.property_id,
    )?.property;
    if (
      !match ||
      !property ||
      !requirement ||
      !validateSeekerRequirement(requirement).ok
    )
      throw new Error("CIRCLE_MATCH_UNAVAILABLE");
    if (active.current) {
      setSection("opportunities");
      setAttribution(nextAttribution);
      setOpportunity({
        id: matchId,
        property,
        requirement: requirement as SeekerRequirement,
        ownProperty:
          rows.find((row) => row.id === match.property_id)?.publisher_id ===
          owner,
      });
    }
  }

  useEffect(() => {
    if (!selected || section !== "members") return;
    let live = true;
    setMembersFailed(false);
    setMembers([]);
    void rpc<typeof members>("vs_circle_members", { p_circle: selected.id })
      .then((value) => {
        if (live) setMembers(value);
      })
      .catch(() => {
        if (live) setMembersFailed(true);
      });
    return () => {
      live = false;
    };
  }, [selected?.id, section, rpc]);

  function runCircleMatch(
    circle: Circle,
    scope: MatchScope,
    share?: SeekerRequirement,
  ) {
    return perform(async () => {
      if (share) {
        const fresh = await store.getRequirement(share.id);
        if (!fresh) throw new Error("CIRCLE_REQUIREMENT_NOT_FOUND");
        await setCircleRequirementMatching(api.current, circle.id, fresh, true);
      }
      await rpc("vs_circle_run_matching", { p_circle: circle.id });
      setSection("opportunities");
      setTools(null);
      await loadCircle(circle, scope);
    });
  }

  const visibleAutomatic = automatic.filter((match) => {
    if (!matchScope || matchScope.kind === "all") return true;
    if (matchScope.kind === "request")
      return (
        match.request_id === matchScope.id ||
        sharedRequests.some(
          (request) =>
            request.id === match.request_id &&
            request.local_id === matchScope.id,
        )
      );
    return (
      match.property_id === matchScope.id ||
      listings.some(
        ({ row }) =>
          row.id === match.property_id &&
          row.publisher_id === owner &&
          row.source_key === matchScope.id,
      )
    );
  });

  function publish(property: Property) {
    if (!selected) return;
    void perform(
      async () => {
        const fresh = await store.getProperty(property.core.id);
        const facts = fresh && circlePropertyFacts(fresh);
        if (!facts) throw new Error("CIRCLE_LISTING_CHANGED");
        await publishCircleProperty(
          api.current,
          selected.id,
          facts,
          Crypto.randomUUID(),
        );
        setSelectedPropertyId(null);
        setTools(null);
        await loadCircle(selected);
      },
      L("تم نشر العقار في الدائرة", "Property published to the circle"),
    );
  }

  function listingLabel(property: Property) {
    const location = getAreaById(property.core.locationArea.id);
    const offer = property.activeOffer;
    const price =
      offer.transaction === "rent" ? offer.rentalPrice : offer.salePrice;
    const cadence =
      offer.transaction === "rent"
        ? {
            daily: L("يوميًا", "daily"),
            monthly: L("شهريًا", "monthly"),
            yearly: L("سنويًا", "yearly"),
          }[offer.rentalPeriodId ?? "monthly"]
        : "";
    const details = property.typeDetails;
    const rooms =
      details && "bedroomCount" in details && details.bedroomCount !== undefined
        ? ` · ${details.bedroomCount} ${L("غرف", "bedrooms")}`
        : "";
    const availability =
      property.rentalAvailability === "rented"
        ? L(" · مؤجّر", " · Rented")
        : property.marketingStatus === "paused"
          ? L(" · موقوف", " · Paused")
          : "";
    const type = getSavedPropertyTypeLabel(
      property,
      language,
      t(
        `propertyType.${property.core.propertyType}` as Parameters<typeof t>[0],
      ),
    );
    return `${type} · ${location?.[language] ?? property.core.locationArea.id} · ${formatPrice(price.amount, price.currencyCode, language)} ${cadence}${rooms}${availability}`;
  }

  function listingCardSummary(property: Property) {
    return getPropertyCardSummary(property, {
      language,
      translate: (key) => t(key as Parameters<typeof t>[0]),
      formatPrice: (amount, currency) =>
        formatPrice(amount, currency, language),
      formatRentalPrice: (amount, currency, period) =>
        formatRentalPrice(amount, currency, period, language, (key) =>
          t(key as Parameters<typeof t>[0]),
        ),
    });
  }

  function manageStatus(status: ListingStatus) {
    if (!managed || !selected) return;
    void perform(async () => {
      const property = await store.getProperty(managed.row.source_key);
      if (!property) throw new Error("CIRCLE_LISTING_CHANGED");
      const updated = await changeListingStatus({
        expected: property,
        status,
        store,
        storage,
      });
      setManaged({ ...managed, property: updated });
      await loadCircle(selected);
    });
  }

  function withdrawManaged() {
    if (!managed || !selected) return;
    void perform(
      async () => {
        await rpc("vs_circle_publish", {
          p_circle: selected.id,
          p_source: managed.row.source_key,
          p_expected: managed.row.revision,
          p_operation: Crypto.randomUUID(),
          p_facts: null,
          p_withdraw: true,
        });
        setManaged(null);
        await loadCircle(selected);
      },
      L("تم حفظ التغيير", "Change saved"),
    );
  }

  const toolTitles: Record<CircleTool, string> = {
    create: L("إنشاء دائرة", "Create circle"),
    invite: L("دعوة زميل", "Invite colleague"),
    publish: L("نشر عقار", "Share property"),
    match: L("مطابقة طلب", "Match request"),
    matchProperty: L("مطابقة عقار", "Match property"),
    notifications: L("إشعارات الدائرة", "Circle notifications"),
  };
  const openTool = (name: CircleTool) => {
    setDone("");
    setFailed(false);
    if (name === "publish") setSelectedPropertyId(null);
    if (name === "match") setSelectedRequestId(null);
    setTools(name);
  };
  const renderCooperation = (entry: Cooperation) => (
    <CircleCooperationCard
      key={entry.id}
      entry={entry}
      owner={owner}
      member={memberFor(
        entry.sender_id === owner ? entry.recipient_id : entry.sender_id,
      )}
      busy={busy}
      onAction={(action: CooperationAction) =>
        void perform(
          async () => {
            if (!selected) return;
            await rpc("vs_circle_cooperation_action", {
              p_circle: selected.id,
              p_id: entry.id,
              p_action: action,
            });
            await loadCircle(selected);
          },
          L("تم حفظ التغيير", "Change saved"),
        )
      }
      onUpdateListing={() =>
        void perform(async () => {
          const listing = listings.find(
            (item) =>
              item.row.source_key === entry.source_key &&
              item.row.publisher_id === owner,
          );
          const property =
            entry.source_key && (await store.getProperty(entry.source_key));
          if (!listing || !property) throw new Error("CIRCLE_LISTING_CHANGED");
          setFocusedCooperation(null);
          setManaged({ row: listing.row, property });
        })
      }
    />
  );
  const focusedEntry = cooperations.find(
    (entry) => entry.id === focusedCooperation,
  );
  const circleOptions = (
    <CompactDropdown
      iconOnly
      title={L("خيارات الدائرة", "Circle options")}
      triggerLabel={L("خيارات الدائرة", "Circle options")}
      testID="circle-actions"
      options={[
        ...(selected
          ? [
              {
                value: "match",
                label: toolTitles.match,
                onPress: () => openTool("match"),
              },
            ]
          : []),
        {
          value: "refresh",
          label: L("تحديث الدوائر والنتائج", "Refresh circles and results"),
          testID: "circle-refresh",
          onPress: () =>
            void perform(async () => {
              const refreshed = await refresh();
              if (
                selected &&
                refreshed.some((circle) => circle.id === selected.id)
              )
                await loadCircle(selected);
              else {
                setSelected(null);
                setListings([]);
                setAutomatic([]);
                setSharedRequests([]);
                setCooperations([]);
                setMatchScope(null);
                setResults(null);
              }
            }),
        },
        {
          value: "create",
          label: toolTitles.create,
          onPress: () => openTool("create"),
        },
        ...(Platform.OS === "android"
          ? [
              {
                value: "notifications",
                label: toolTitles.notifications,
                onPress: () => openTool("notifications"),
              },
            ]
          : []),
        {
          value: "join",
          label: L("قبول دعوة برابط", "Accept invitation link"),
          onPress: () => router.push("/circle-invite/open" as never),
        },
      ]}
    />
  );
  const Content = fullScreen ? KeyboardAwareScrollViewCompat : View;
  const enabledRequests = sharedRequests.filter(
    (item) =>
      item.local_id && requirements.some((req) => req.id === item.local_id),
  );
  return (
    <View style={fullScreen ? { flex: 1 } : { gap: 10, marginBottom: 16 }}>
      <Content
        {...(fullScreen
          ? {
              contentContainerStyle: {
                padding: 16,
                paddingBottom: 24,
                gap: 12,
              },
            }
          : { style: { gap: 10 } })}
      >
        {!fullScreen && (
          <>
            <AssistantText bold>
              {L(
                "شارك عقارك، وخل الطلب المناسب يوصلك",
                "Share your listing and discover suitable requests",
              )}
            </AssistantText>
            <AssistantText>
              {L(
                "المطابقة تربط مواصفات العقارات بطلبات العملاء داخل دائرتك. بيانات العميل والمالك تبقى خاصة، وتقدر تطلب التعاون من فرصة المطابقة.",
                "Matching connects shared listings to client requests in your circle. Client and owner details stay private; request cooperation from a match.",
              )}
            </AssistantText>
          </>
        )}
        {!busy && !failed && !circles.length && (
          <>
            <AssistantText>
              {L(
                "أنشئ دائرة مع زملائك، أو افتح رابط الدعوة اللي وصلك. بعدها شارك عقار أو فعّل مطابقة طلب عميل.",
                "Create a circle or share your invitation ID with its owner. Then share a listing or enable matching for a client request.",
              )}
            </AssistantText>
            <Action
              tone="primary"
              label={L("إنشاء أول دائرة", "Create your first circle")}
              onPress={() => openTool("create")}
            />
            <Action
              label={L("قبول دعوة برابط", "Accept invitation link")}
              onPress={() => router.push("/circle-invite/open" as never)}
            />
          </>
        )}
        {failed && !tools && (
          <Text accessibilityRole="alert" style={{ color: colors.destructive }}>
            {failureMessage}
          </Text>
        )}
        {busy && <ActivityIndicator color={colors.primary} />}
        {done && (
          <View
            accessibilityLiveRegion="polite"
            style={{
              backgroundColor: colors.secondary,
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.medium,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {done}
            </Text>
          </View>
        )}
        {[...invitations]
          .sort(
            (a, b) =>
              Number(b.circle_id === initialCircleId) -
              Number(a.circle_id === initialCircleId),
          )
          .map((invite) => (
            <CircleInvitationCard
              key={invite.circle_id}
              invite={invite}
              busy={busy}
              onAccept={() =>
                void perform(
                  async () => {
                    const outcome = await acceptCircleInvitation(
                      api.current,
                      invite,
                    );
                    const available = await refresh();
                    if (outcome === "joined") {
                      const joined = available.find(
                        (circle) => circle.id === invite.circle_id,
                      );
                      if (joined) await loadCircle(joined);
                    }
                  },
                  invite.requires_review
                    ? L(
                        "تم إرسال طلب الانضمام. بانتظار موافقة مسؤول الدائرة.",
                        "Join request sent. Awaiting the circle owner's approval.",
                      )
                    : L("تم الانضمام للدائرة", "Joined the circle"),
                )
              }
              onDecline={() =>
                void perform(
                  async () => {
                    await rpc("vs_circle_decline", {
                      p_circle: invite.circle_id,
                    });
                    await refresh();
                  },
                  L("تم حفظ التغيير", "Change saved"),
                )
              }
            />
          ))}
        <View
          style={{
            direction: "ltr",
            flexDirection: isRTL ? "row-reverse" : "row",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <View style={{ flex: 1 }}>
            {circles.length > 0 && (
              <CompactDropdown
                label={L("الدائرة", "Circle")}
                testID="circle-picker"
                options={circles.map((circle) => ({
                  value: circle.id,
                  label: circle.name,
                  selected: circle.id === selected?.id,
                  testID: `circle-open-${circle.id}`,
                  onPress: () =>
                    void perform(async () => {
                      setTools(null);
                      setDetail(null);
                      setOpportunity(undefined);
                      setMembers([]);
                      setSelected(null);
                      setListings([]);
                      setAutomatic([]);
                      setSharedRequests([]);
                      setCooperations([]);
                      setMatchScope(null);
                      setResults(null);
                      setSelectedPropertyId(null);
                      setSelectedRequestId(null);
                      setManaged(null);
                      setCooperationMatch(null);
                      setFocusedCooperation(null);
                      await loadCircle(
                        circle,
                        selected ? undefined : initialMatch,
                      );
                    }),
                }))}
              />
            )}
          </View>
          {circleOptions}
        </View>
        {selected && !fullScreen && (
          <View style={{ gap: 8 }}>
            <Action
              icon="upload"
              label={toolTitles.publish}
              tone="primary"
              disabled={busy}
              onPress={() => openTool("publish")}
              testID="circle-open-publish"
            />
            <View
              style={{
                direction: "ltr",
                flexDirection: isRTL ? "row-reverse" : "row",
                gap: 8,
              }}
            >
              {selected.owner_id === owner && (
                <View style={{ flex: 1 }}>
                  <Action
                    icon="user-plus"
                    label={toolTitles.invite}
                    disabled={busy}
                    onPress={() => openTool("invite")}
                    testID="circle-open-invite"
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Action
                  icon="search"
                  label={toolTitles.matchProperty}
                  disabled={busy}
                  onPress={() => openTool("matchProperty")}
                  testID="circle-open-match-property"
                />
              </View>
            </View>
          </View>
        )}

        {selected && (
          <>
            <View
              testID="circle-matching-status"
              style={{
                backgroundColor:
                  enabledRequests.length && !failed
                    ? "#EDF8F1"
                    : colors.secondary,
                padding: 14,
                borderRadius: 14,
                gap: 6,
              }}
            >
              <View
                style={{
                  direction: "ltr",
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <AssistantText bold>
                    {failed
                      ? L(
                          "تعذّر تحديث حالة المطابقة",
                          "Could not refresh matching",
                        )
                      : serverProcessing
                        ? L("جارٍ فحص المطابقات", "Checking matches")
                        : enabledRequests.length
                          ? L(
                              "مطابقة طلباتك التلقائية مفعّلة",
                              "Your automatic request matching is enabled",
                            )
                          : L(
                              "فعّل مطابقة أول طلب عميل",
                              "Enable your first request",
                            )}
                  </AssistantText>
                </View>
                <Switch
                  testID="circle-matching-switch"
                  accessibilityLabel={L(
                    "المطابقة التلقائية لطلباتك في الدائرة",
                    "Your automatic matching in this circle",
                  )}
                  value={enabledRequests.length > 0}
                  disabled={busy || failed}
                  onValueChange={(value) => {
                    if (value) openTool("match");
                    else
                      void perform(
                        async () => {
                          await rpc("vs_circle_matching_pause", {
                            p_circle: selected.id,
                          });
                          await loadCircle(selected);
                        },
                        L(
                          "تم إيقاف مطابقة طلباتك في هذه الدائرة",
                          "Your request matching was paused in this circle",
                        ),
                      );
                  }}
                />
              </View>
              {lastChecked && (
                <AssistantText muted>
                  {L("آخر تحديث للنتائج: ", "Results refreshed: ")}
                  {new Date(lastChecked).toLocaleTimeString(
                    ar ? "ar-KW" : "en-GB",
                    { hour: "2-digit", minute: "2-digit" },
                  )}
                </AssistantText>
              )}
              <Action
                label={L("اختيار طلب للمطابقة", "Choose a request to match")}
                onPress={() => openTool("match")}
                disabled={busy}
              />
            </View>
            <View
              style={{
                direction: "ltr",
                flexDirection: isRTL ? "row-reverse" : "row",
                gap: 8,
              }}
            >
              {(
                ["opportunities", "properties", "requests", "members"] as const
              ).map((value) => (
                <View key={value} style={{ flex: 1 }}>
                  <Action
                    label={
                      value === "opportunities"
                        ? L("الفرص", "Opportunities")
                        : value === "properties"
                          ? L("العقارات", "Properties")
                          : value === "requests"
                            ? L("الطلبات", "Requests")
                            : L("الأعضاء", "Members")
                    }
                    tone={section === value ? "primary" : "secondary"}
                    onPress={() => setSection(value)}
                  />
                </View>
              ))}
            </View>
            {selected.owner_id === owner && (
              <CircleJoinReviewPanel
                key={owner + ":" + selected.id}
                circleId={selected.id}
                request={api.current}
                onChanged={async () => {
                  await loadCircle(selected);
                  if (section === "members") setSection("opportunities");
                }}
              />
            )}
            {section === "requests" && (
              <View style={{ gap: 16 }}>
                {!sharedRequests.length && (
                  <AssistantText>
                    {L(
                      "لا توجد طلبات مشاركة في هذه الدائرة.",
                      "No shared requests in this circle.",
                    )}
                  </AssistantText>
                )}
                {sharedRequests.map((item) => {
                  const member = memberFor(
                    attribution.requests.find(
                      (request) => request.id === item.id,
                    )?.owner_id,
                  );
                  return (
                    <View
                      key={item.id}
                      style={{
                        gap: 8,
                        padding: 16,
                        borderWidth: 1,
                        borderRadius: 16,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      }}
                    >
                      <AssistantText bold>
                        {t(
                          `propertyType.${item.type}` as Parameters<
                            typeof t
                          >[0],
                        )}{" "}
                        ·{" "}
                        {item.purpose === "rent"
                          ? L("للإيجار", "For rent")
                          : L("للشراء", "To buy")}
                      </AssistantText>
                      <CircleMemberAttribution
                        member={member}
                        own={member?.user_id === owner}
                        label={L("صاحب طلب العميل", "Request shared by")}
                      />
                    </View>
                  );
                })}
              </View>
            )}
            {section === "members" && (
              <>
                {membersFailed ? (
                  <AssistantText>
                    {L(
                      "تعذّر تحميل الأعضاء. افتح التبويب مرة ثانية للمحاولة.",
                      "Could not load members. Reopen this tab to retry.",
                    )}
                  </AssistantText>
                ) : !members.length ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  members.map((member) => (
                    <View
                      key={member.user_id}
                      style={{
                        backgroundColor: colors.card,
                        padding: 14,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: colors.border,
                        gap: 4,
                      }}
                    >
                      <AssistantText bold>
                        {member.display_name ||
                          L("زميل • ", "Colleague • ") +
                            member.user_id.slice(-6)}
                      </AssistantText>
                      {!!member.company && (
                        <AssistantText>{member.company}</AssistantText>
                      )}
                      <AssistantText muted>
                        {member.is_owner
                          ? L("مسؤول الدائرة", "Circle owner")
                          : member.state === "invited"
                            ? L("بانتظار قبول الدعوة", "Invitation pending")
                            : L("عضو في الدائرة", "Circle member")}
                      </AssistantText>
                    </View>
                  ))
                )}
              </>
            )}
            {section === "opportunities" && (
              <>
                {!busy &&
                  !failed &&
                  !serverProcessing &&
                  !visibleAutomatic.length &&
                  !results?.length && (
                    <AssistantText>
                      {L(
                        "ما فيه فرص مطابقة ظاهرة لك للحين. شارك عقار أو فعّل مطابقة طلب؛ نعرض الفرصة لما تتوفر مواصفات مناسبة.",
                        "No visible matching opportunities yet. Share a listing or enable a request; suitable opportunities will appear here.",
                      )}
                    </AssistantText>
                  )}
                {!busy && listings.length === 0 && (
                  <AssistantText>
                    {L(
                      "لا توجد عقارات منشورة في هذه الدائرة.",
                      "This circle has no published listings yet.",
                    )}
                  </AssistantText>
                )}
                {(matchScope || visibleAutomatic.length > 0) && (
                  <AssistantText bold>
                    {L("نتائج المطابقة", "Matching results")} · {selected.name}
                  </AssistantText>
                )}
                {results
                  ?.filter(
                    (result) =>
                      !visibleAutomatic.some(
                        (match) =>
                          match.property_id === result.propertyId &&
                          sharedRequests.some(
                            (request) =>
                              request.id === match.request_id &&
                              request.local_id === result.requirementId,
                          ),
                      ),
                  )
                  .map((match) => {
                    const listing = listings.find(
                      (item) => item.property.core.id === match.propertyId,
                    );
                    return (
                      listing && (
                        <View
                          key={`${match.propertyId}-${match.requirementId}`}
                        >
                          <AssistantText bold>
                            {L("فرصة مطابقة", "Matching opportunity")} ·{" "}
                            {listingLabel(listing.property)}
                          </AssistantText>
                          <Action
                            label={L("عرض العقار", "View property")}
                            onPress={() =>
                              setDetail({
                                kind: "property",
                                id: match.propertyId,
                              })
                            }
                          />
                        </View>
                      )
                    );
                  })}
                {visibleAutomatic.map((match) => {
                  const listing = listings.find(
                    (item) => item.property.core.id === match.property_id,
                  );
                  if (!listing) return null;
                  const existing = cooperations.some(
                    (entry) =>
                      entry.match_id === match.id &&
                      ["pending", "accepted", "completed"].includes(
                        entry.status,
                      ),
                  );
                  return (
                    <View
                      key={match.id}
                      style={{
                        gap: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                        borderRadius: 16,
                        padding: 16,
                      }}
                    >
                      <AssistantText bold>
                        {listing.row.publisher_id === owner
                          ? L(
                              "عقارك يناسب طلب عميل زميلك",
                              "Your property fits a colleague’s request",
                            )
                          : L(
                              "عقار زميلك يناسب طلب عميلك",
                              "A colleague’s property fits your client request",
                            )}
                      </AssistantText>
                      <AssistantText>
                        {listingLabel(listing.property)}
                      </AssistantText>
                      <CircleMemberAttribution member={matchMember(match.id)} />
                      <Action
                        label={L(
                          "شوف تفاصيل المطابقة",
                          "View matched requirements",
                        )}
                        disabled={busy}
                        testID={`circle-request-details-${match.id}`}
                        onPress={() =>
                          void perform(() =>
                            openMatchOpportunity(selected.id, match.id),
                          )
                        }
                      />
                    </View>
                  );
                })}
                {cooperationMatch && (
                  <CircleCooperationRequest
                    busy={busy}
                    onClose={() => setCooperationMatch(null)}
                    onSend={(purpose, terms) =>
                      void perform(
                        async () => {
                          await rpc("vs_circle_cooperation_request", {
                            p_circle: selected.id,
                            p_match: cooperationMatch,
                            p_purpose: purpose,
                            p_terms: terms,
                          });
                          setCooperationMatch(null);
                          await loadCircle(selected);
                        },
                        L("تم حفظ التغيير", "Change saved"),
                      )
                    }
                  />
                )}
                {cooperations.length > 0 && (
                  <AssistantText bold>
                    {L("طلبات التعاون", "Cooperation requests")}
                  </AssistantText>
                )}
                {cooperations.map(renderCooperation)}
              </>
            )}
            {section === "properties" && (
              <>
                <AssistantText bold>
                  {L("العقارات المشاركة", "Shared properties")} (
                  {listings.length})
                </AssistantText>
                {!busy && !listings.length && (
                  <AssistantText>
                    {L(
                      "ما فيه عقارات مشاركة للحين. اضغط «شارك عقار» لإضافة أول عقار.",
                      "No shared listings yet. Share your first property below.",
                    )}
                  </AssistantText>
                )}
                {listings.map(({ row, property }) => {
                  const summary = listingCardSummary(property);
                  return (
                    <View
                      key={row.id}
                      style={{
                        direction: "ltr",
                        backgroundColor: colors.card,
                        padding: 16,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 16,
                        gap: 10,
                      }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        testID={`circle-listing-details-${row.id}`}
                        accessibilityLabel={L(
                          "تفاصيل العقار",
                          "Listing details",
                        )}
                        onPress={() =>
                          setDetail({ kind: "property", id: row.id })
                        }
                        style={{ minHeight: 48, gap: 8 }}
                      >
                        <PropertyCardContent
                          property={property}
                          title={summary.typeLabel}
                          area={summary.areaLabel}
                          price={summary.valueLabel}
                        />
                      </Pressable>
                      <CircleMemberAttribution
                        member={memberFor(row.publisher_id)}
                        own={row.publisher_id === owner}
                      />
                      {row.publisher_id === owner && (
                        <Action
                          label={L("إدارة الإعلان", "Manage listing")}
                          testID={`circle-manage-${row.id}`}
                          disabled={busy}
                          onPress={() =>
                            void perform(async () => {
                              const local = await store.getProperty(
                                row.source_key,
                              );
                              if (!local) throw Error("CIRCLE_LISTING_CHANGED");
                              setManaged({ row, property: local });
                            })
                          }
                        />
                      )}
                      <Action
                        label={L("طابق هذا العقار", "Match this property")}
                        testID={`circle-match-property-${row.id}`}
                        disabled={busy}
                        onPress={() =>
                          void runCircleMatch(selected, {
                            kind: "property",
                            id: row.id,
                          })
                        }
                      />
                    </View>
                  );
                })}
                <Action
                  label={L(
                    "مطابقة الكل في هذه الدائرة",
                    "Match all in this circle",
                  )}
                  testID="circle-match-all"
                  disabled={busy}
                  onPress={() => void runCircleMatch(selected, { kind: "all" })}
                />
              </>
            )}
          </>
        )}
      </Content>
      {fullScreen && selected && (
        <View
          testID="circle-fixed-actions"
          style={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 12),
            borderTopWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            direction: "ltr",
            flexDirection: isRTL ? "row-reverse" : "row",
            gap: 10,
          }}
        >
          <Button
            testID="circle-share-fixed"
            title={L("شارك عقار", "Share listing")}
            style={{ flex: 1 }}
            disabled={busy}
            onPress={() => openTool("publish")}
          />
          <Button
            testID="circle-invite-fixed"
            title={L("دعوة زميل", "Invite colleague")}
            variant="outline"
            style={{ flex: 1 }}
            disabled={busy}
            onPress={() => openTool("invite")}
          />
        </View>
      )}
      {tools === "invite" && (
        <CircleInviteComposer
          initialCircleId={selected?.id}
          onClose={() => setTools(null)}
        />
      )}
      {managed && (
        <CircleManageListing
          property={managed.property}
          title={
            properties.find(
              (property) => property.core.id === managed.row.source_key,
            )?.listingTitle || listingLabel(managed.property)
          }
          busy={busy}
          onClose={() => setManaged(null)}
          onStatus={manageStatus}
          onWithdraw={withdrawManaged}
        />
      )}
      {focusedEntry && (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => setFocusedCooperation(null)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 20,
              backgroundColor: "#00000066",
            }}
          >
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 14,
                padding: 14,
                gap: 10,
              }}
            >
              {renderCooperation(focusedEntry)}
              <Action
                label={L("إغلاق", "Close")}
                onPress={() => setFocusedCooperation(null)}
              />
            </View>
          </View>
        </Modal>
      )}
      <Modal
        visible={tools !== null && tools !== "invite" && detail === null}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!busy) setTools(null);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#00000066",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={L("إغلاق", "Close")}
            onPress={() => {
              if (!busy) setTools(null);
            }}
            style={{ flex: 1 }}
          />
          <View
            testID="circle-action-sheet"
            accessibilityViewIsModal
            style={{
              height: "82%",
              maxHeight: "90%",
              backgroundColor: colors.card,
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: 16,
              paddingBottom: Math.max(insets.bottom, 12),
              gap: 10,
            }}
          >
            <View
              style={{
                direction: "ltr",
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
              }}
            >
              <Text
                accessibilityRole="header"
                style={{
                  flex: 1,
                  fontFamily: fonts.bold,
                  fontSize: 22,
                  color: colors.foreground,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {tools && toolTitles[tools]}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L("إغلاق", "Close")}
                disabled={busy}
                onPress={() => setTools(null)}
                style={{
                  width: 48,
                  height: 48,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            <KeyboardAwareScrollViewCompat
              keyboardShouldPersistTaps="handled"
              bottomOffset={24}
              contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
            >
              {busy && <ActivityIndicator color={colors.primary} />}
              {failed && <AssistantText>{failureMessage}</AssistantText>}
              {tools === "create" && (
                <>
                  <AssistantField
                    label={L("اسم الدائرة الجديدة", "New circle name")}
                    value={name}
                    onChangeText={setName}
                    maxLength={80}
                  />
                  <Action
                    testID="circle-create"
                    label={L("إنشاء دائرة", "Create circle")}
                    disabled={busy || !name.trim()}
                    onPress={() =>
                      void perform(
                        async () => {
                          const id = Crypto.randomUUID();
                          await rpc("vs_circle_create", {
                            p_id: id,
                            p_name: name.trim(),
                          });
                          setName("");
                          setTools(null);
                          const available = await refresh(),
                            created = available.find(
                              (circle) => circle.id === id,
                            );
                          if (created) await loadCircle(created);
                        },
                        L("تم إنشاء الدائرة", "Circle created"),
                      )
                    }
                  />
                </>
              )}
              {selected && tools === "publish" && (
                <>
                  {!properties.some((property) =>
                    circlePropertyFacts(property),
                  ) && (
                    <AssistantText>
                      {L(
                        "ما فيه عقار جاهز للمشاركة. أضف عقارًا وراجع بياناته أولًا.",
                        "No eligible listing. Add and review a property first.",
                      )}
                    </AssistantText>
                  )}
                  <CompactDropdown
                    label={L("العقار المراد نشره", "Listing to publish")}
                    options={properties
                      .filter((property) => circlePropertyFacts(property))
                      .map((property) => ({
                        value: property.core.id,
                        label: listingLabel(property),
                        selected: property.core.id === selectedPropertyId,
                        testID: `circle-select-property-${property.core.id}`,
                        onPress: () => {
                          if (!busy) setSelectedPropertyId(property.core.id);
                        },
                      }))}
                  />
                  {selectedProperty && (
                    <>
                      <AssistantText>
                        {listingLabel(selectedProperty)}
                      </AssistantText>
                      <AssistantText muted>
                        {L(
                          "المشاركة تشمل المواصفات العامة فقط. بيانات العميل والمالك والملاحظات الخاصة ما تنعرض.",
                          "Only public matching facts are shared. Client/owner details and private notes stay private.",
                        )}
                      </AssistantText>
                      <Action
                        label={L(
                          "معاينة المواصفات المشاركة",
                          "Preview shared facts",
                        )}
                        onPress={() => {
                          const facts = circlePropertyFacts(selectedProperty);
                          if (facts)
                            setDetail({ kind: "preview", property: facts });
                        }}
                      />
                      <Action
                        label={L(
                          "نشر المواصفات في الدائرة",
                          "Publish listing facts to circle",
                        )}
                        testID="circle-publish"
                        disabled={busy}
                        onPress={() => publish(selectedProperty)}
                      />
                    </>
                  )}
                </>
              )}
              {selected && tools === "matchProperty" && (
                <CompactDropdown
                  label={L("اختر عقارًا مشاركًا", "Choose a shared property")}
                  options={listings.map(({ row, property }) => ({
                    value: row.id,
                    label: listingLabel(property),
                    selected:
                      matchScope?.kind === "property" &&
                      matchScope.id === row.id,
                    onPress: () =>
                      void runCircleMatch(selected, {
                        kind: "property",
                        id: row.id,
                      }),
                  }))}
                />
              )}
              {selected && tools === "match" && (
                <>
                  {!requirements.length && (
                    <AssistantText>
                      {L(
                        "أضف طلب عميل أولًا عشان تختار مواصفاته للمطابقة.",
                        "Add a client request to choose its matching criteria.",
                      )}
                    </AssistantText>
                  )}
                  <CompactDropdown
                    label={L("الطلب المراد مطابقته", "Request to match")}
                    options={[
                      ...requirements
                        .filter((requirement) =>
                          circleRequestFacts(requirement),
                        )
                        .map((requirement, index) => ({
                          value: requirement.id,
                          label: `${L("طلبي", "My request")} ${index + 1} • ${formatMatchingBudget(requirement, language)}`,
                          selected: requirement.id === selectedRequestId,
                          testID: `circle-select-request-${requirement.id}`,
                          onPress: () => {
                            if (!busy) {
                              setSelectedRequestId(requirement.id);
                              setMatchScope(null);
                              setResults(null);
                            }
                          },
                        })),
                      ...sharedRequests
                        .filter((request) => !request.local_id)
                        .map((request, index) => ({
                          value: request.id,
                          label: `${L("طلب مشارك", "Shared request")} ${index + 1} · ${memberFor(attribution.requests.find((item) => item.id === request.id)?.owner_id)?.display_name || L("عضو لم يحدد اسمه", "Member name unavailable")} • ${t(`propertyType.${request.type}` as Parameters<typeof t>[0])}`,
                          selected:
                            matchScope?.kind === "request" &&
                            matchScope.id === request.id,
                          onPress: () => {
                            setSelectedRequestId(null);
                            void runCircleMatch(selected, {
                              kind: "request",
                              id: request.id,
                            });
                          },
                        })),
                    ]}
                  />
                  {selectedRequest && (
                    <>
                      <AssistantText muted>
                        {L(
                          "اسم العميل ورقمه بيانات خاصة. عند مشاركة الطلب يظهر اسمك ومكتبك ورقم تواصلك لأعضاء الدائرة.",
                          "Client name and phone stay private. Sharing displays your name, company and contact number to circle members.",
                        )}
                      </AssistantText>
                      <Action
                        label={L(
                          "مشاركة المواصفات وتشغيل المطابقة",
                          "Share criteria and run matching",
                        )}
                        testID="circle-share-request"
                        disabled={busy}
                        onPress={() =>
                          void runCircleMatch(
                            selected,
                            { kind: "request", id: selectedRequest.id },
                            selectedRequest,
                          )
                        }
                      />
                      <Action
                        label={L(
                          "بحث خاص داخل الدائرة",
                          "Search circle privately",
                        )}
                        testID="circle-match-now"
                        disabled={busy}
                        onPress={() =>
                          void runCircleMatch(selected, {
                            kind: "request",
                            id: selectedRequest.id,
                          })
                        }
                      />
                      {sharedRequests.some(
                        (item) => item.local_id === selectedRequest.id,
                      ) && (
                        <Action
                          label={L(
                            "إيقاف المطابقة التلقائية للطلب",
                            "Stop automatic matching for request",
                          )}
                          disabled={busy}
                          onPress={() =>
                            void perform(
                              async () => {
                                await setCircleRequirementMatching(
                                  api.current,
                                  selected.id,
                                  selectedRequest,
                                  false,
                                );
                                await loadCircle(selected);
                              },
                              L(
                                "تم إيقاف مطابقة الطلب",
                                "Request matching paused",
                              ),
                            )
                          }
                        />
                      )}
                    </>
                  )}
                </>
              )}
              {tools === "notifications" && Platform.OS === "android" && (
                <>
                  <Action
                    label={L(
                      "تفعيل إشعارات الدائرة على هذا الهاتف",
                      "Enable circle notifications on this phone",
                    )}
                    testID="circle-push-enable"
                    disabled={busy}
                    onPress={() =>
                      void perform(
                        async () => {
                          await setCirclePush(api.current, owner, true);
                          setTools(null);
                        },
                        L(
                          "تم تفعيل إشعارات الدائرة",
                          "Circle notifications enabled",
                        ),
                      )
                    }
                  />
                  <Action
                    label={L(
                      "إيقاف إشعارات الدائرة",
                      "Disable circle notifications",
                    )}
                    disabled={busy}
                    onPress={() =>
                      void perform(
                        async () => {
                          await setCirclePush(api.current, owner, false);
                          setTools(null);
                        },
                        L(
                          "تم إيقاف إشعارات الدائرة",
                          "Circle notifications disabled",
                        ),
                      )
                    }
                  />
                </>
              )}
            </KeyboardAwareScrollViewCompat>
          </View>
        </View>
      </Modal>
      {opportunity && (
        <CircleMatchDetails
          opportunity={opportunity}
          member={matchMember(opportunity.id)}
          onClose={() => setOpportunity(undefined)}
          onCooperate={
            cooperations.some(
              (entry) =>
                entry.match_id === opportunity.id &&
                ["pending", "accepted", "completed"].includes(entry.status),
            )
              ? undefined
              : () => {
                  setCooperationMatch(opportunity.id);
                  setOpportunity(undefined);
                  setSection("opportunities");
                }
          }
        />
      )}
      <CircleSharedDetails
        member={
          detail?.kind === "property"
            ? memberFor(
                listings.find((item) => item.row.id === detail.id)?.row
                  .publisher_id,
              )
            : detail?.kind === "request"
              ? matchMember(detail.id)
              : undefined
        }
        property={
          detail?.kind === "preview"
            ? detail.property
            : detail?.kind === "property"
              ? listings.find((item) => item.row.id === detail.id)?.property
              : undefined
        }
        requirement={detail?.kind === "request" ? detail.request : undefined}
        onClose={() => setDetail(null)}
      />
    </View>
  );
}
