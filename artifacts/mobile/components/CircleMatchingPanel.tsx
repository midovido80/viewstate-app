import { useIsFocused } from '@react-navigation/native';
import { CircleSharedDetails } from './CircleSharedDetails';
import { validateSeekerRequirement } from '@workspace/property-domain';
import { Feather } from '@expo/vector-icons';
import { CompactDropdown } from '@/components/FormChoices';
import { PropertyFactStrip, PropertyStatus } from '@/components/PropertyVisualSummary';
import { getSavedPropertyTypeLabel } from '@/services/savedPropertyClassification';
import { CircleCooperationCard, CircleCooperationRequest, type Cooperation, type CooperationAction } from './CircleCooperation';
import { CircleManageListing } from './CircleManageListing';
import { useUserData } from '@/contexts/UserDataContext';
import { changeListingStatus, type ListingStatus } from '@/services/propertyLifecycle';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Platform, Pressable, Share, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { MatchResult, Property, SeekerRequirement } from '@workspace/property-domain';
import { Action, AssistantField, AssistantText } from '@/components/assistant/ui';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice } from '@/constants/market';
import { CircleMatchingSource, type SharedCircleProperty } from '@/services/circleMatchingSource';
import { BrokerInitiatedMatching } from '@/services/brokerInitiatedMatching';
import { circlePropertyFacts, circleRequestFacts, circleRpc, setCircleRequirementMatching } from '@/services/circleMatchingApi';
import { setCirclePush } from '@/services/circlePush';
import type { CloudRequest } from '@/services/workspaceCloud';

type Circle = { id: string; name: string; owner_id: string };
type Invitation = { circle_id: string };
type AutomaticMatch = { id: string; request_id: string; property_id: string; score: number };
type SharedRequest = { id: string; local_id: string | null; type: string; purpose: string };
type MatchScope = { kind: 'request' | 'property'; id: string } | { kind: 'all' };
type Listing = { row: SharedCircleProperty; property: Property };
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
}

export function CircleMatchingPanel({ request, owner, properties, requirements, initialMatch, initialCircleId, noticeKind, noticeTargetId }: Props) {
  const { language, t, fonts, isRTL } = useI18n();
  const colors = useColors();
  const { store, storage } = useUserData();
  const focused = useIsFocused();
  const [detail, setDetail] = useState<{ kind: 'property'; id: string } | { kind: 'request'; id: string; request: SeekerRequirement } | null>(null);
  const [managed, setManaged] = useState<Listing | null>(null);
  const ar = language === 'ar';
  const L = (arabic: string, english: string) => ar ? arabic : english;
  const api = useRef(request);
  api.current = request;
  const rpc = useCallback(<T,>(name: `vs_circle_${string}`, params = {}) =>
    circleRpc<T>(api.current, name, params), []);
  const active = useRef(false);
  const flight = useRef(false);
  const polling = useRef<Promise<void> | null>(null);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [cooperations, setCooperations] = useState<Cooperation[]>([]);
  const [focusedCooperation, setFocusedCooperation] = useState<string | null>(null);
  const [cooperationMatch, setCooperationMatch] = useState<string | null>(null);
  const [sharedRequests, setSharedRequests] = useState<SharedRequest[]>([]);
  const [serverProcessing, setServerProcessing] = useState(false);
  const [matchScope, setMatchScope] = useState<MatchScope | null>(null);
  const [automatic, setAutomatic] = useState<AutomaticMatch[]>([]);
  const [results, setResults] = useState<readonly (MatchResult & { requirementId: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [name, setName] = useState('');
  const [invitee, setInvitee] = useState('');
  const [tools, setTools] = useState<"create" | "invite" | "publish" | "match" | "matchProperty" | "notifications" | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const selectedRequest = requirements.find(requirement => requirement.id === selectedRequestId);
  const selectedProperty = properties.find(property => property.core.id === selectedPropertyId);

  const refresh = useCallback(async () => {
    const [nextCircles, nextInvitations] = await Promise.all([
      rpc<Circle[]>('vs_circle_list'), rpc<Invitation[]>('vs_circle_invitations'),
    ]);
    if (active.current) {
      setCircles(nextCircles);
      setInvitations(nextInvitations);
    }
    return nextCircles;
  }, [rpc]);

  const perform = useCallback(async (work: () => Promise<void>, showDone = false) => {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setFailed(false);
    setDone(false);
    try {
      await polling.current;
      if (!active.current) return;
      await work();
      if (active.current && showDone) setDone(true);
    } catch {
      if (active.current) {
        setListings([]);
        setResults(null);
        setAutomatic([]);
        setCooperations([]);
        setManaged(null);
        setDetail(null);
        setCooperationMatch(null);
        setFailed(true);
      }
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void perform(async () => {
      const available = await refresh();
      const initialCircle = available.find(circle => circle.id === initialCircleId)
        ?? (available.length === 1 ? available[0] : undefined);
      if (active.current && initialCircle) {
        await loadRef.current(initialCircle, initialMatch);
        if (initialCircle.id !== initialCircleId || !noticeTargetId || !active.current) return;
        if (noticeKind === 'listing') setDetail({ kind: 'property', id: noticeTargetId });
        if (noticeKind === 'cooperation') setFocusedCooperation(noticeTargetId);
        if (noticeKind === 'requirement') await openSharedRequirement(initialCircle.id, noticeTargetId);
      }
    });
    return () => { active.current = false; };
  }, [perform, refresh, initialCircleId, noticeKind, noticeTargetId]);

  async function loadCircle(circle: Circle, scope?: MatchScope, quiet = false) {
    const [rows, workspace, history] = await Promise.all([
      rpc<SharedCircleProperty[]>('vs_circle_catalog', { p_circle: circle.id }),
      rpc<{ requests: SharedRequest[]; matches: AutomaticMatch[]; processing?: boolean }>('vs_circle_matching_workspace', { p_circle: circle.id }),
      rpc<Cooperation[]>('vs_circle_cooperation_list', { p_circle: circle.id }),
    ]);
    const source = new CircleMatchingSource(async () => rows);
    const candidates = await source.getCandidates();
    const byId = new Map(rows.map(row => [row.id, row]));
    const { requests, matches } = workspace;
    const propertyId = scope?.kind === 'property' ? rows.find(row =>
      row.id === scope.id || row.publisher_id === owner && row.source_key === scope.id)?.id : undefined;
    const matchCandidates = scope?.kind === 'property'
      ? candidates.filter(candidate => candidate.property.core.id === propertyId)
      : candidates;
    const localRequests = requirements.filter(requirement => circleRequestFacts(requirement)
      && (scope?.kind !== 'request' || scope.id === requirement.id));
    const excluded = rows.filter(row => row.publisher_id === owner).map(row => row.id);
    const localResults = scope ? await Promise.all(localRequests.map(async requirement => {
      const service = new BrokerInitiatedMatching(
        { getRequirement: async () => requirement }, { getCandidates: async () => matchCandidates },
      );
      const run = await service.runForRequirement(requirement.id, { strictFields: ['location'] }, excluded);
      return run.matches.map(result => ({ ...result, requirementId: requirement.id }));
    })) : null;
    if (!active.current) return;
    setSelected(circle);
    setListings(candidates.map(({ property }) => ({ property, row: byId.get(property.core.id)! })));
    setAutomatic(matches);
    setServerProcessing(workspace.processing === true);
    setSharedRequests(requests);
    setCooperations(history);
    setManaged(current => {
      if (!current) return null;
      const row = byId.get(current.row.id);
      return row ? { ...current, row } : null;
    });
    if (!quiet) setMatchScope(scope ?? null);
    if (!quiet || scope) setResults(localResults?.flat() ?? null);
    setDetail(current => current?.kind === 'request' && !matches.some(match => match.id === current.id) ? null : current);
  }

  const loadRef = useRef(loadCircle);
  loadRef.current = loadCircle;
  useEffect(() => {
    if (!focused) return;
    const refreshActive = () => {
      if (AppState.currentState === 'background' || flight.current || polling.current) return;
      polling.current = (async () => {
        try {
          const available = await refresh();
          if (!active.current) return;
          const circle = selected ? available.find(item => item.id === selected.id) : available.length === 1 ? available[0] : undefined;
          if (circle) await loadRef.current(circle, selected ? matchScope ?? undefined : initialMatch, true);
          else if (selected) { setSelected(null); setListings([]); setAutomatic([]); setSharedRequests([]); setCooperations([]); setMatchScope(null); setResults(null); setManaged(null); setDetail(null); }
        } catch {
          if (active.current) setFailed(true);
        } finally {
          polling.current = null;
        }
      })();
    };
    void refreshActive();
    const timer = setInterval(() => void refreshActive(), serverProcessing ? 3_000 : 30_000);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refreshActive();
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [focused, selected?.id, refresh, matchScope, serverProcessing]);

  async function openSharedRequirement(circleId: string, matchId: string) {
    const facts = await rpc<Record<string, unknown> | null>('vs_circle_match_requirement', { p_circle: circleId, p_match: matchId });
    const requirement = facts && { ...facts, id: matchId, notes: '' };
    if (!requirement || !validateSeekerRequirement(requirement).ok) throw new Error('CIRCLE_REQUEST_UNAVAILABLE');
    if (active.current) setDetail({ kind: 'request', id: matchId, request: requirement as SeekerRequirement });
  }

  function runCircleMatch(circle: Circle, scope: MatchScope, share?: SeekerRequirement) {
    return perform(async () => {
      if (share) {
        const fresh = await store.getRequirement(share.id);
        if (!fresh) throw new Error('CIRCLE_REQUIREMENT_NOT_FOUND');
        await setCircleRequirementMatching(api.current, circle.id, fresh, true);
      }
      await rpc('vs_circle_run_matching', { p_circle: circle.id });
      await loadCircle(circle, scope);
    });
  }

  const visibleAutomatic = automatic.filter(match => {
    if (!matchScope || matchScope.kind === 'all') return true;
    if (matchScope.kind === 'request') return match.request_id === matchScope.id
      || sharedRequests.some(request => request.id === match.request_id && request.local_id === matchScope.id);
    return match.property_id === matchScope.id
      || listings.some(({ row }) => row.id === match.property_id && row.publisher_id === owner && row.source_key === matchScope.id);
  });

  function publish(property: Property) {
    if (!selected) return;
    void perform(async () => {
      const fresh = await store.getProperty(property.core.id);
      const facts = fresh && circlePropertyFacts(fresh);
      if (!facts) throw new Error('CIRCLE_LISTING_CHANGED');
      const revision = await rpc<number>('vs_circle_my_publication', {
        p_circle: selected.id, p_source: property.core.id,
      });
      await rpc('vs_circle_publish', {
        p_circle: selected.id, p_source: property.core.id, p_facts: facts,
        p_expected: revision, p_operation: Crypto.randomUUID(),
      });
      setSelectedPropertyId(null);
      await loadCircle(selected);
    }, true);
  }

  function listingLabel(property: Property) {
    const location = getAreaById(property.core.locationArea.id);
    const offer = property.activeOffer;
    const price = offer.transaction === 'rent' ? offer.rentalPrice : offer.salePrice;
    const cadence = offer.transaction === 'rent' ? ({
      daily: L('يوميًا', 'daily'), monthly: L('شهريًا', 'monthly'), yearly: L('سنويًا', 'yearly'),
    })[offer.rentalPeriodId ?? 'monthly'] : '';
    const details = property.typeDetails;
    const rooms = details && 'bedroomCount' in details && details.bedroomCount !== undefined
      ? ` · ${details.bedroomCount} ${L('غرف', 'bedrooms')}` : '';
    const availability = property.rentalAvailability === 'rented' ? L(' · مؤجّر', ' · Rented')
      : property.marketingStatus === 'paused' ? L(' · موقوف', ' · Paused') : '';
    const type = getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}` as Parameters<typeof t>[0]));
    return `${type} · ${location?.[language] ?? property.core.locationArea.id} · ${formatPrice(price.amount, price.currencyCode, language)} ${cadence}${rooms}${availability}`;
  }

  function manageStatus(status: ListingStatus) {
    if (!managed || !selected) return;
    void perform(async () => {
      const property = await store.getProperty(managed.row.source_key);
      if (!property) throw new Error('CIRCLE_LISTING_CHANGED');
      const updated = await changeListingStatus({ expected: property, status, store, storage });
      setManaged({ ...managed, property: updated });
      await loadCircle(selected);
    });
  }

  function withdrawManaged() {
    if (!managed || !selected) return;
    void perform(async () => {
      await rpc('vs_circle_publish', {
        p_circle: selected.id, p_source: managed.row.source_key, p_expected: managed.row.revision,
        p_operation: Crypto.randomUUID(), p_facts: null, p_withdraw: true,
      });
      setManaged(null);
      await loadCircle(selected);
    }, true);
  }

  const primaryActions = [
    { key: 'match', icon: 'target', label: L('مطابقة طلب', 'Match request') },
    { key: 'matchProperty', icon: 'search', label: L('مطابقة عقار', 'Match property') },
    { key: 'publish', icon: 'upload', label: L('نشر عقار', 'Share property') },
    ...(selected?.owner_id === owner ? [{ key: 'invite', icon: 'user-plus', label: L('دعوة وسيط', 'Invite broker') } as const] : []),
  ] as const;
  const renderCooperation = (entry: Cooperation) => <CircleCooperationCard key={entry.id} entry={entry} owner={owner} busy={busy}
    onAction={(action: CooperationAction) => void perform(async () => {
      if (!selected) return;
      await rpc('vs_circle_cooperation_action', { p_circle: selected.id, p_id: entry.id, p_action: action });
      await loadCircle(selected);
    }, true)}
    onUpdateListing={() => void perform(async () => {
      const listing = listings.find(item => item.row.source_key === entry.source_key && item.row.publisher_id === owner);
      const property = entry.source_key && await store.getProperty(entry.source_key);
      if (!listing || !property) throw new Error('CIRCLE_LISTING_CHANGED');
      setFocusedCooperation(null);
      setManaged({ row: listing.row, property });
    })} />;
  const focusedEntry = cooperations.find(entry => entry.id === focusedCooperation);
  return <View style={{ gap: 10, marginBottom: 16 }}>
    {failed && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{L(
      'تعذّر تنفيذ الإجراء. حاول مرة أخرى.',
      'Could not complete this action. Try again.',
    )}</Text>}
    {busy && <ActivityIndicator color={colors.primary} />}
    {done && <AssistantText>{L('تم الحفظ', 'Saved')}</AssistantText>}
    {[...invitations].sort((a, b) => Number(b.circle_id === initialCircleId) - Number(a.circle_id === initialCircleId)).map(invite => <View key={invite.circle_id} style={{ gap: 6 }}>
      <AssistantText bold>{L('دعوة لدائرة الثقة', 'Trust Circle invitation')}</AssistantText>
      <Action label={L('قبول الدعوة', 'Accept invitation')} disabled={busy} testID={`circle-accept-${invite.circle_id}`}
        onPress={() => void perform(async () => { await rpc('vs_circle_accept', { p_circle: invite.circle_id }); await refresh(); }, true)} />
      <Action label={L('رفض الدعوة', 'Decline invitation')} disabled={busy} testID={`circle-decline-${invite.circle_id}`}
        onPress={() => void perform(async () => { await rpc('vs_circle_decline', { p_circle: invite.circle_id }); await refresh(); }, true)} />
    </View>)}
    {circles.length > 0 && <CompactDropdown label={L('الدائرة', 'Circle')} testID="circle-picker" options={circles.map(circle => ({
      value: circle.id, label: circle.name, selected: circle.id === selected?.id, testID: `circle-open-${circle.id}`,
      onPress: () => void perform(async () => {
        setTools(null); setDetail(null); setSelected(null); setListings([]); setAutomatic([]); setSharedRequests([]); setCooperations([]); setMatchScope(null); setResults(null);
        setSelectedPropertyId(null); setSelectedRequestId(null); setManaged(null); setCooperationMatch(null); setFocusedCooperation(null);
        await loadCircle(circle, selected ? undefined : initialMatch);
      }),
    }))} />}
    <CompactDropdown label={L('المزيد', 'More')} inlineLabel testID="circle-actions" options={[
      { value: 'refresh', label: L('تحديث الدوائر والنتائج', 'Refresh circles and results'), testID: 'circle-refresh', onPress: () => void perform(async () => {
        const refreshed = await refresh();
        if (selected && refreshed.some(circle => circle.id === selected.id)) await loadCircle(selected);
        else { setSelected(null); setListings([]); setAutomatic([]); setSharedRequests([]); setCooperations([]); setMatchScope(null); setResults(null); }
      }) },
      { value: 'create', label: L('إنشاء دائرة', 'Create circle'), onPress: () => setTools('create') },
      ...(Platform.OS === 'android' ? [{ value: 'notifications', label: L('إشعارات الدائرة', 'Circle notifications'), onPress: () => setTools('notifications') }] : []),
      { value: 'share-id', label: L('مشاركة معرّفي للدعوة', 'Share my invitation ID'), onPress: () => {
        void Share.share({ message: owner }).catch(() => setFailed(true));
      } },
    ]} />
    {selected && <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      {primaryActions.map(action => <Pressable key={action.key} accessibilityRole="button"
        accessibilityState={{ selected: tools === action.key, disabled: busy }} disabled={busy}
        onPress={() => setTools(current => current === action.key ? null : action.key)}
        style={({ pressed }) => ({
          width: '48%', minHeight: 58, backgroundColor: tools === action.key ? colors.muted : colors.card,
          borderWidth: 1, borderColor: tools === action.key ? colors.primary : colors.border, borderRadius: 12,
          flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, opacity: pressed ? 0.75 : 1,
        })}>
        <Feather name={action.icon} size={18} color={colors.primary} />
        <Text style={{ flex: 1, color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{action.label}</Text>
      </Pressable>)}
    </View>}
    {tools === 'create' && <>
    <AssistantField label={L('اسم الدائرة الجديدة', 'New circle name')} value={name} onChangeText={setName} maxLength={80} />
    <Action label={L('إنشاء دائرة', 'Create circle')} disabled={busy || !name.trim()} testID="circle-create"
      onPress={() => void perform(async () => {
        const id = Crypto.randomUUID();
        await rpc('vs_circle_create', { p_id: id, p_name: name.trim() });
        setName('');
        setTools(null);
        const refreshed = await refresh();
        const created = refreshed.find(circle => circle.id === id);
        if (created) await loadCircle(created);
      }, true)} />
    </>}
    {tools === 'invite' && selected?.owner_id === owner && <>
      <AssistantField label={L('معرّف حساب البروكر', 'Broker account ID')} value={invitee} onChangeText={setInvitee} autoCapitalize="none" maxLength={36} />
      <Action label={L('إرسال دعوة', 'Invite broker')} disabled={busy || !userIdPattern.test(invitee.trim())}
        testID="circle-invite" onPress={() => void perform(async () => {
          await rpc('vs_circle_member', { p_circle: selected.id, p_user: invitee.trim(), p_action: 'invite' });
          setInvitee('');
        }, true)} />
    </>}
    {selected && <>
      {!busy && listings.length === 0 && <AssistantText>{L('لا توجد عقارات منشورة في هذه الدائرة.', 'This circle has no published listings yet.')}</AssistantText>}
      {tools === 'publish' && <CompactDropdown label={L('العقار المراد نشره', 'Listing to publish')} options={properties.filter(property => circlePropertyFacts(property)).map(property => ({
        value: property.core.id, label: listingLabel(property), selected: property.core.id === selectedPropertyId,
        testID: `circle-select-property-${property.core.id}`, onPress: () => setSelectedPropertyId(property.core.id),
      }))} />}
      {tools === 'publish' && selectedProperty && <>
        <AssistantText>{listingLabel(selectedProperty)}</AssistantText>
        <AssistantText muted>{L('المشاركة تشمل المواصفات العامة فقط.', 'Only general listing facts are shared.')}</AssistantText>
        <Action label={L('نشر المواصفات في الدائرة', 'Publish listing facts to circle')} testID="circle-publish"
          disabled={busy} onPress={() => publish(selectedProperty)} />
      </>}
      {tools === 'matchProperty' && <CompactDropdown label={L('اختر عقارًا مشاركًا', 'Choose a shared property')}
        options={listings.map(({ row, property }) => ({
          value: row.id, label: listingLabel(property), selected: matchScope?.kind === 'property' && matchScope.id === row.id,
          onPress: () => void runCircleMatch(selected, { kind: 'property', id: row.id }),
        }))} />}
      {tools === 'match' && <CompactDropdown label={L('الطلب المراد مطابقته', 'Request to match')} options={[
        ...requirements.filter(requirement => circleRequestFacts(requirement)).map((requirement, index) => ({
          value: requirement.id, label: `${L('طلبي', 'My request')} ${index + 1} · ${requirement.budget.maximum} KWD`,
          selected: requirement.id === selectedRequestId, testID: `circle-select-request-${requirement.id}`,
          onPress: () => { setSelectedRequestId(requirement.id); setMatchScope(null); setResults(null); },
        })),
        ...sharedRequests.filter(request => !request.local_id).map((request, index) => ({
          value: request.id, label: `${L('طلب مشارك', 'Shared request')} ${index + 1} · ${t(`propertyType.${request.type}` as Parameters<typeof t>[0])} · ${request.purpose === 'rent' ? L('إيجار', 'Rent') : L('شراء', 'Buy')}`,
          selected: matchScope?.kind === 'request' && matchScope.id === request.id,
          onPress: () => { setSelectedRequestId(null); void runCircleMatch(selected, { kind: 'request', id: request.id }); },
        })),
      ]} />}
      {tools === 'match' && selectedRequest && <>
        <AssistantText muted>{sharedRequests.some(item => item.local_id === selectedRequest.id)
          ? L('مشارك في الدائرة', 'Shared in this circle') : L('اسم العميل ورقمه يفضلوا خاصين.', 'Client name and phone stay private.')}</AssistantText>
        <Action label={L('مشاركة المواصفات وتشغيل المطابقة', 'Share criteria and run matching')} disabled={busy}
          testID="circle-share-request" onPress={() => void runCircleMatch(selected, { kind: 'request', id: selectedRequest.id }, selectedRequest)} />
        <Action label={L('بحث خاص داخل الدائرة', 'Search circle privately')} disabled={busy} testID="circle-match-now"
          onPress={() => void runCircleMatch(selected, { kind: 'request', id: selectedRequest.id })} />
        {sharedRequests.some(item => item.local_id === selectedRequest.id) && <Action label={L('إيقاف المطابقة التلقائية للطلب', 'Stop automatic matching for request')} disabled={busy}
          onPress={() => void perform(async () => {
            await setCircleRequirementMatching(api.current, selected.id, selectedRequest, false);
            await loadCircle(selected);
          }, true)} />}
      </>}
      {(matchScope || visibleAutomatic.length > 0) && <AssistantText bold>{L('نتائج المطابقة', 'Matching results')} · {selected.name}</AssistantText>}
      {results?.filter(result => !visibleAutomatic.some(match => match.property_id === result.propertyId
        && sharedRequests.some(request => request.id === match.request_id && request.local_id === result.requirementId))).map(match => {
        const listing = listings.find(item => item.property.core.id === match.propertyId);
        return listing && <View key={`${match.propertyId}-${match.requirementId}`}>
          <AssistantText>{Math.round(match.score)}% · {listingLabel(listing.property)}</AssistantText>
          <Action label={L('عرض العقار', 'View property')} onPress={() => setDetail({ kind: 'property', id: match.propertyId })} />
        </View>;
      })}
      {visibleAutomatic.map(match => {
        const listing = listings.find(item => item.property.core.id === match.property_id);
        if (!listing) return null;
        const existing = cooperations.some(entry => entry.match_id === match.id && ['pending', 'accepted', 'completed'].includes(entry.status));
        return <View key={match.id} style={{ gap: 6 }}>
          <AssistantText>{Math.round(match.score)}% · {listingLabel(listing.property)}</AssistantText>
          <Action label={L('عرض متطلبات المطابقة', 'View matched requirements')} disabled={busy}
            testID={`circle-request-details-${match.id}`} onPress={() => void perform(() => openSharedRequirement(selected.id, match.id))} />
          {!existing && <Action label={L('طلب تعاون', 'Request cooperation')} disabled={busy}
            testID={`circle-cooperate-${match.id}`} onPress={() => setCooperationMatch(match.id)} />}
        </View>;
      })}
      {cooperationMatch && <CircleCooperationRequest busy={busy} onClose={() => setCooperationMatch(null)}
        onSend={(purpose, terms) => void perform(async () => {
          await rpc('vs_circle_cooperation_request', { p_circle: selected.id, p_match: cooperationMatch, p_purpose: purpose, p_terms: terms });
          setCooperationMatch(null);
          await loadCircle(selected);
        }, true)} />}
      {cooperations.length > 0 && <AssistantText bold>{L('طلبات التعاون', 'Cooperation requests')}</AssistantText>}
      {cooperations.map(renderCooperation)}
      {matchScope && results?.length === 0 && visibleAutomatic.length === 0 && <AssistantText>
        {matchScope.kind === 'property' && !listings.some(({ row }) => row.id === matchScope.id || row.publisher_id === owner && row.source_key === matchScope.id)
          ? L('انشر هذا العقار في الدائرة أولًا لتطابقه مع الطلبات المشاركة.', 'Publish this property in the circle first to match it with shared requests.')
          : matchScope.kind === 'request' && requirements.some(item => item.id === matchScope.id)
            && !sharedRequests.some(item => item.local_id === matchScope.id)
            ? L('الطلب غير مشارك في الدائرة.', 'This request is private.')
            : !sharedRequests.length
              ? L('لا توجد طلبات مشتركة.', 'No shared requests.')
              : serverProcessing
                ? L('جارٍ البحث عن مطابقات…', 'Searching for matches…')
                : L('لا توجد نتائج مطابقة متاحة لهذا البحث.', 'No matching results are available for this search.')}
      </AssistantText>}
      {managed && <CircleManageListing property={managed.property}
        title={properties.find(property => property.core.id === managed.row.source_key)?.listingTitle || listingLabel(managed.property)}
        busy={busy} onClose={() => setManaged(null)} onStatus={manageStatus} onWithdraw={withdrawManaged} />}
      <AssistantText bold>{L('مخزون الدائرة', 'Circle inventory')} ({listings.length})</AssistantText>
      {listings.map(({ row, property }) => {
        const area = getAreaById(property.core.locationArea.id)?.[language] ?? property.core.locationArea.id;
        const title = getSavedPropertyTypeLabel(property, language, t(`propertyType.${property.core.propertyType}` as Parameters<typeof t>[0]));
        const offer = property.activeOffer;
        const price = offer.transaction === 'rent' ? offer.rentalPrice : offer.salePrice;
        return <View key={row.id} style={{ borderColor: colors.border, backgroundColor: colors.card, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 }}>
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', gap: 8, alignItems: 'center' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={L('تفاصيل العقار', 'Listing details') + ': ' + title}
              testID={`circle-listing-details-${row.id}`} onPress={() => setDetail({ kind: 'property', id: row.id })}
              style={{ flex: 1, gap: 6, minHeight: 48, justifyContent: 'center' }}>
              <Text style={{ color: colors.foreground, fontFamily: fonts.bold, fontSize: 16, textAlign: isRTL ? 'right' : 'left' }}>{title}</Text>
              <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{area} · {formatPrice(price.amount, price.currencyCode, language)}</Text>
              <PropertyStatus property={property} />
              <PropertyFactStrip property={property} compact />
            </Pressable>
            {row.publisher_id === owner && <Pressable accessibilityRole="button" accessibilityLabel={L('إدارة الإعلان', 'Manage listing')} disabled={busy}
              style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              testID={`circle-manage-${row.id}`} onPress={() => void perform(async () => {
                const local = await store.getProperty(row.source_key);
                if (!local) throw new Error('CIRCLE_LISTING_CHANGED');
                setManaged({ row, property: local });
              })}><Feather name="more-horizontal" size={22} color={colors.primary} /></Pressable>}
          </View>
          <Action label={L('طابق هذا العقار', 'Match this property')} disabled={busy}
            testID={`circle-match-property-${row.id}`} onPress={() => void runCircleMatch(selected, { kind: 'property', id: row.id })} />
        </View>;
      })}
      <Action label={L('مطابقة الكل في هذه الدائرة', 'Match all in this circle')} disabled={busy}
        testID="circle-match-all" onPress={() => void runCircleMatch(selected, { kind: 'all' })} />
    </>}
    {focusedEntry && <Modal visible animationType="none" transparent onRequestClose={() => setFocusedCooperation(null)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#00000066' }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 8 }}>
          {renderCooperation(focusedEntry)}
          <Action label={L('إغلاق', 'Close')} onPress={() => setFocusedCooperation(null)} />
        </View>
      </View>
    </Modal>}
    <CircleSharedDetails
      property={detail?.kind === 'property' ? listings.find(item => item.row.id === detail.id)?.property : undefined}
      requirement={detail?.kind === 'request' ? detail.request : undefined}
      onClose={() => setDetail(null)}
    />
    {tools === 'notifications' && Platform.OS === 'android' && <>
      <Action label={L('تفعيل إشعارات الدائرة على هذا الهاتف', 'Enable circle notifications on this phone')}
        disabled={busy} testID="circle-push-enable" onPress={() => void perform(() => setCirclePush(api.current, owner, true), true)} />
      <Action label={L('إيقاف إشعارات الدائرة', 'Disable circle notifications')}
        disabled={busy} onPress={() => void perform(() => setCirclePush(api.current, owner, false), true)} />
    </>}
  </View>;
}
