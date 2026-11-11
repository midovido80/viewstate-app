import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { MatchResult, Property, SeekerRequirement } from '@workspace/property-domain';
import { Action, AssistantField, AssistantText } from '@/components/assistant/ui';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { getAreaById } from '@/constants/kuwait-areas';
import { formatPrice } from '@/constants/market';
import { CircleMatchingSource, type SharedCircleProperty } from '@/services/circleMatchingSource';
import { BrokerInitiatedMatching } from '@/services/brokerInitiatedMatching';
import { circlePropertyFacts, circleRequestFacts, circleRpc } from '@/services/circleMatchingApi';
import { setCirclePush } from '@/services/circlePush';
import type { CloudRequest } from '@/services/workspaceCloud';

type Circle = { id: string; name: string; owner_id: string };
type Invitation = { circle_id: string };
type AutomaticMatch = { id: string; property_id: string; score: number };
type Listing = { row: SharedCircleProperty; property: Property };
const userIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

interface Props {
  request: CloudRequest;
  owner: string;
  properties: readonly Property[];
  requirements: readonly SeekerRequirement[];
}

export function CircleMatchingPanel({ request, owner, properties, requirements }: Props) {
  const { language } = useI18n();
  const colors = useColors();
  const ar = language === 'ar';
  const L = (arabic: string, english: string) => ar ? arabic : english;
  const api = useRef(request);
  api.current = request;
  const rpc = useCallback(<T,>(name: `vs_circle_${string}`, params = {}) =>
    circleRpc<T>(api.current, name, params), []);
  const active = useRef(false);
  const flight = useRef(false);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [selected, setSelected] = useState<Circle | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [automatic, setAutomatic] = useState<AutomaticMatch[]>([]);
  const [results, setResults] = useState<readonly MatchResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [name, setName] = useState('');
  const [invitee, setInvitee] = useState('');
  const [showProperties, setShowProperties] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
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
      await work();
      if (active.current && showDone) setDone(true);
    } catch {
      if (active.current) {
        setListings([]);
        setResults(null);
        setAutomatic([]);
        setFailed(true);
      }
    } finally {
      flight.current = false;
      if (active.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    void perform(async () => { await refresh(); });
    return () => { active.current = false; };
  }, [perform, refresh]);

  async function loadCircle(circle: Circle, requirement?: SeekerRequirement) {
    setListings([]);
    setResults(null);
    setAutomatic([]);
    const [rows, matches] = await Promise.all([
      rpc<SharedCircleProperty[]>('vs_circle_catalog', { p_circle: circle.id }),
      rpc<AutomaticMatch[]>('vs_circle_matches', { p_circle: circle.id }),
    ]);
    const source = new CircleMatchingSource(async () => rows);
    const candidates = await source.getCandidates();
    const byId = new Map(rows.map(row => [row.id, row]));
    const matchesForRequest = requirement ? await new BrokerInitiatedMatching(
      { getRequirement: async () => requirement }, source,
    ).runForRequirement(requirement.id, { strictFields: ['location'] }, rows.filter(row => row.publisher_id === owner).map(row => row.id)) : null;
    if (!active.current) return;
    setSelected(circle);
    setListings(candidates.map(({ property }) => ({ property, row: byId.get(property.core.id)! })));
    setAutomatic(matches);
    setResults(matchesForRequest?.matches ?? null);
  }

  const loadRef = useRef(loadCircle);
  loadRef.current = loadCircle;
  useEffect(() => {
    if (!selected) return;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void perform(() => loadRef.current(selected));
    });
    return () => subscription.remove();
  }, [selected, perform]);

  function publish(property: Property) {
    if (!selected) return;
    const facts = circlePropertyFacts(property);
    if (!facts) return;
    void perform(async () => {
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
    return `${location?.[language] ?? property.core.locationArea.id} · ${formatPrice(price.amount, price.currencyCode, language)} ${cadence}${rooms}${availability}`;
  }

  return <View style={{ gap: 10, marginBottom: 16 }}>
    <AssistantText bold>{L('مطابقة دائرة الثقة', 'Trust circle matching')}</AssistantText>
    <Text selectable style={{ color: colors.foreground }}>{L('معرّف حسابي للدعوة', 'My account ID for invitations')}{'\n'}{owner}</Text>
    <Action label={L('تحديث الدوائر والنتائج', 'Refresh circles and results')} disabled={busy} onPress={() => void perform(async () => {
      const refreshed = await refresh();
      if (selected && refreshed.some(circle => circle.id === selected.id)) await loadCircle(selected);
      else { setSelected(null); setListings([]); setAutomatic([]); setResults(null); }
    })} testID="circle-refresh" />
    {failed && <Text accessibilityRole="alert" style={{ color: colors.destructive }}>{L(
      'تعذّر إتمام العملية. راجع الاتصال أو الصلاحية وحدّث الدائرة قبل إعادة المحاولة.',
      'The operation could not be completed. Check connectivity or access and refresh before retrying.',
    )}</Text>}
    {busy && <AssistantText>{L('جارٍ التحميل…', 'Loading…')}</AssistantText>}
    {done && <AssistantText>{L('تم الحفظ على الخادم.', 'Saved on the server.')}</AssistantText>}
    <AssistantField label={L('اسم الدائرة الجديدة', 'New circle name')} value={name} onChangeText={setName} maxLength={80} />
    <Action label={L('إنشاء دائرة', 'Create circle')} disabled={busy || !name.trim()} testID="circle-create"
      onPress={() => void perform(async () => {
        await rpc('vs_circle_create', { p_id: Crypto.randomUUID(), p_name: name.trim() });
        setName('');
        await refresh();
      }, true)} />
    {invitations.map(invite => <View key={invite.circle_id} style={{ gap: 6 }}>
      <AssistantText>{L('دعوة لدائرة', 'Circle invitation')} {invite.circle_id}</AssistantText>
      <Action label={L('قبول الدعوة', 'Accept invitation')} disabled={busy} testID={`circle-accept-${invite.circle_id}`}
        onPress={() => void perform(async () => { await rpc('vs_circle_accept', { p_circle: invite.circle_id }); await refresh(); }, true)} />
      <Action label={L('رفض الدعوة', 'Decline invitation')} disabled={busy} testID={`circle-decline-${invite.circle_id}`}
        onPress={() => void perform(async () => { await rpc('vs_circle_decline', { p_circle: invite.circle_id }); await refresh(); }, true)} />
    </View>)}
    {circles.map(circle => <Action key={circle.id} label={circle.name} disabled={busy}
      tone={circle.id === selected?.id ? 'primary' : 'secondary'} testID={`circle-open-${circle.id}`}
      onPress={() => void perform(async () => {
        setSelected(null); setListings([]); setAutomatic([]); setResults(null);
        setSelectedPropertyId(null); setSelectedRequestId(null);
        await loadCircle(circle);
      })} />)}
    {selected?.owner_id === owner && <>
      <AssistantField label={L('معرّف حساب البروكر', 'Broker account ID')} value={invitee} onChangeText={setInvitee} autoCapitalize="none" maxLength={36} />
      <Action label={L('إرسال دعوة', 'Invite broker')} disabled={busy || !userIdPattern.test(invitee.trim())}
        testID="circle-invite" onPress={() => void perform(async () => {
          await rpc('vs_circle_member', { p_circle: selected.id, p_user: invitee.trim(), p_action: 'invite' });
          setInvitee('');
        }, true)} />
    </>}
    {selected && <>
      <Action label={L('اختيار عقار للنشر', 'Choose listing to publish')} disabled={busy} onPress={() => setShowProperties(value => !value)} />
      {showProperties && properties.filter(property => circlePropertyFacts(property)).map(property =>
        <Action key={property.core.id} label={listingLabel(property)} disabled={busy} testID={`circle-select-property-${property.core.id}`}
          onPress={() => { setSelectedPropertyId(property.core.id); setShowProperties(false); }} />)}
      {selectedProperty && <>
        <AssistantText>{listingLabel(selectedProperty)}</AssistantText>
        <Action label={L('نشر المواصفات في الدائرة', 'Publish listing facts to circle')} testID="circle-publish"
          disabled={busy} onPress={() => publish(selectedProperty)} />
      </>}
      <Action label={L('اختيار طلب للمطابقة', 'Choose request to match')} disabled={busy} onPress={() => setShowRequirements(value => !value)} />
      {showRequirements && requirements.filter(requirement => circleRequestFacts(requirement)).map((requirement, index) => (
        <Action key={requirement.id} label={`${L('طلب إيجار', 'Rental request')} ${index + 1} · ${requirement.budget.maximum} KWD`}
          disabled={busy} testID={`circle-select-request-${requirement.id}`}
          onPress={() => { setSelectedRequestId(requirement.id); setShowRequirements(false); setResults(null); }} />
      ))}
      {selectedRequest && <>
        <AssistantText>{L('الطلب المختار', 'Selected request')} · {selectedRequest.budget.maximum} KWD</AssistantText>
        <Action label={L('مطابقة الآن داخل الدائرة', 'Match now in circle')} disabled={busy} testID="circle-match-now"
          onPress={() => void perform(() => loadCircle(selected, selectedRequest))} />
        <AssistantText>{L(
          'المطابقة التلقائية تستخدم المناطق والميزانية وفترة الإيجار وعدد الغرف والحمامات.',
          'Automatic matching uses areas, budget, rental period, bedrooms and bathrooms.',
        )}</AssistantText>
        <Action label={L('تفعيل المطابقة التلقائية للطلب', 'Share request for automatic matching')} disabled={busy}
          testID="circle-share-request" onPress={() => void perform(async () => {
            await rpc('vs_circle_request', { ...circleRequestFacts(selectedRequest), p_circle: selected.id });
          }, true)} />
        <Action label={L('إيقاف المطابقة التلقائية للطلب', 'Stop automatic matching for request')} disabled={busy}
          onPress={() => void perform(async () => {
            await rpc('vs_circle_request', { ...circleRequestFacts(selectedRequest), p_circle: selected.id, p_withdraw: true });
            await loadCircle(selected);
          }, true)} />
      </>}
      <AssistantText bold>{L('مخزون الدائرة', 'Circle inventory')} ({listings.length})</AssistantText>
      {(results ?? automatic.map(match => ({ propertyId: match.property_id, score: match.score }))).map((match, index) => {
        const listing = listings.find(item => item.property.core.id === match.propertyId);
        if (!listing) return null;
        return <AssistantText key={`${match.propertyId}-${index}`}>{Math.round(match.score)}% · {listingLabel(listing.property)}</AssistantText>;
      })}
      {results?.length === 0 && <AssistantText>{L('لا توجد مطابقات لهذا الطلب في الدائرة.', 'No circle matches for this request.')}</AssistantText>}
      {listings.map(({ row, property }) => <View key={row.id} style={{ gap: 5 }}>
        <AssistantText>{listingLabel(property)}</AssistantText>
        {row.publisher_id === owner && <Action label={L('سحب العرض من الدائرة', 'Withdraw from circle')} disabled={busy}
          testID={`circle-withdraw-${row.id}`} onPress={() => void perform(async () => {
            await rpc('vs_circle_publish', { p_circle: selected.id, p_source: row.source_key,
              p_expected: row.revision, p_operation: Crypto.randomUUID(), p_facts: null, p_withdraw: true });
            await loadCircle(selected);
          }, true)} />}
      </View>)}
    </>}
    {Platform.OS === 'android' && <>
      <Action label={L('تفعيل إشعارات الدائرة على هذا الهاتف', 'Enable circle notifications on this phone')}
        disabled={busy} testID="circle-push-enable" onPress={() => void perform(() => setCirclePush(api.current, owner, true), true)} />
      <Action label={L('إيقاف إشعارات الدائرة', 'Disable circle notifications')}
        disabled={busy} onPress={() => void perform(() => setCirclePush(api.current, owner, false), true)} />
    </>}
  </View>;
}
