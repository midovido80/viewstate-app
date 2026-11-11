import { CircleMatchingPanel } from '@/components/CircleMatchingPanel';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { matchingTarget, resolveMatchingScope, matchingScopeKey, matchingRestoreFits, runSavedMatchingScope } from '@/services/matchingScope';
import {useSyncedFocusEffect as useFocusEffect} from '@/hooks/useSyncedFocusEffect';
import { selectHomeMatches } from '@/services/assistantHome';
import { MatchingResultCard } from '@/components/MatchingResultCard';
import type { BrokerMatchingRunResult } from '@/services/brokerInitiatedMatching';
import { QuickMatchingForm } from '@/components/QuickMatchingForm';
import { QuickMatchingResults } from '@/components/QuickMatchingResults';
import { emptyQuickMatchingFilters, validQuickMatchingFilters, runQuickMatching, type QuickMatchingFilters, type QuickPropertyMatch } from '@/services/quickMatching';
import { useUserData } from '@/contexts/UserDataContext';
import { MatchingResultsGroups } from '@/components/MatchingResultsGroups';
import type { MatchingResultsLayout } from '@/services/matchingGroups';
import { readMatchingReturn, rememberMatchingReturn } from '@/services/matchingReturnSession';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import {
  type MatchingPolicy,
  type Property,
  type SeekerRequirement,
} from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

import { MyPropertiesMatchingSource } from '@/services/myPropertiesMatchingSource';
import {
  type MatchAllPersonGroup,
} from '@/services/matchingUi';
import type { Person } from '@/services/people';

type MatchingMode = 'saved' | 'quick';

function numberFromInput(value: string): number | undefined {
  const trimmed = value.trim().replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  if (!trimmed || !/^\d+(?:\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

export default function MatchingScreen() {
  const { store } = useUserData();
  const account = useRealAccount();
  const [circleMode, setCircleMode] = useState(false);
  const params = useLocalSearchParams<{ scope?: string; entry?: string; requirementId?: string; propertyId?: string; best?: string; returnSession?: string }>();
  const scope = resolveMatchingScope(params);
  const scopeKey = JSON.stringify([matchingScopeKey(scope), params.entry ?? '']);
  const requestedRequirementId = scope.kind === 'requirement' ? scope.id : undefined;
  const requestedPropertyId = scope.kind === 'property' ? scope.id : undefined;
  const best = scope.kind === 'best' ? '1' : undefined;
  const returnSession = typeof params.returnSession === 'string' ? params.returnSession : undefined;
  const scopedRecord = scope.kind === 'property' || scope.kind === 'requirement';
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;
  const colors = useColors();
  const { t, isRTL, language, fonts } = useI18n();
  const router = useRouter();
  const insets = useScreenInsets();

  const [mode, setMode] = useState<MatchingMode>('saved');
  const [requirements, setRequirements] = useState<SeekerRequirement[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [quickFilters, setQuickFilters] = useState<QuickMatchingFilters>(emptyQuickMatchingFilters);
  const [quickResults, setQuickResults] = useState<QuickPropertyMatch[] | null>(null);
  const [budgetText, setBudgetText] = useState({minimum:'',maximum:''});
  const [resultScopeKey, setResultScopeKey] = useState('');
  const [matchAllGroups, setMatchAllGroups] = useState<MatchAllPersonGroup[] | null>(null);
  const [unlinkedRun, setUnlinkedRun] = useState<{ requirement: SeekerRequirement; run: BrokerMatchingRunResult } | null>(null);
  const [error, setError] = useState('');
  const [policies, setPolicies] = useState<Record<string, MatchingPolicy>>({});
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const runGenerationRef = useRef(0);
  const matchAllRequested = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const restoreOffsetRef = useRef<number | null>(null);
  const lastEntryRef = useRef<string | undefined>(undefined);
  const openedReturnTokenRef = useRef<string | undefined>(undefined);
  const dismissedReturnTokenRef = useRef<string | undefined>(undefined);
  const [resultsLayout, setResultsLayout] = useState<MatchingResultsLayout>({ view: 'people' });
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      runGenerationRef.current += 1;
      setLoading(false);
      setQuickResults(null);
      setUnlinkedRun(null);
      setMatchAllGroups(null);
      setError(scope.kind === 'invalid' ? (language === 'ar' ? 'تعذر تحديد سجل المطابقة. اختر مطابقة الكل أو افتح السجل من جديد.' : 'The matching record could not be identified. Choose Match all or reopen the record.') : '');
      const freshEntry = params.entry !== lastEntryRef.current;
      lastEntryRef.current = params.entry;
      if (freshEntry && !returnSession) openedReturnTokenRef.current = undefined;
      const savedRestore = readMatchingReturn(openedReturnTokenRef.current)
        ?? (returnSession !== dismissedReturnTokenRef.current ? readMatchingReturn(returnSession) : undefined);
      const restore = matchingRestoreFits(scope, savedRestore) ? savedRestore : undefined;
      setPolicies(restore?.policies ?? {});
      setExcluded(restore?.excluded ?? {});
      Promise.all([store.getRequirements(), store.getPeople(), store.getProperties()])
        .then(([loadedRequirements, loadedPeople, loadedProperties]) => {
          if (!active) return;
          setRequirements(loadedRequirements);
          setPeople(loadedPeople);
          setProperties(loadedProperties);
          if (requestedRequirementId || requestedPropertyId || best || matchAllRequested.current) { setMode('saved'); setPendingRestore('requested'); matchAllRequested.current=false; }
          if (scope.kind !== 'all') { setMode('saved'); setResultsLayout({ view: requestedPropertyId ? 'people' : 'properties' }); }
          if (restore) {
            setMode(scope.kind === 'all' ? restore.mode : 'saved');
            setResultsLayout(restore.layout ?? { view: 'people' });
            restoreOffsetRef.current = restore.scrollOffset;
            if (restore.quickFilters) {
              setQuickFilters(restore.quickFilters);
              setBudgetText({minimum:String(restore.quickFilters.minimumBudget??''),maximum:String(restore.quickFilters.maximumBudget??'')});
            }
            setPendingRestore(restore.token);
          }

        })
        .catch(() => {
          if (active) setError(t('matching.load_failed'));
        });
      return () => {
        active = false;
        runGenerationRef.current += 1;
      };
    }, [scopeKey, returnSession, store, t]),
  );

  const clearRun = () => {
    openedReturnTokenRef.current = undefined;
    dismissedReturnTokenRef.current = returnSession;
    setResultsLayout({ view: requestedPropertyId ? 'people' : 'properties' });
    runGenerationRef.current += 1;
    setLoading(false);
    setQuickResults(null);
    setUnlinkedRun(null);
    setMatchAllGroups(null);
    setError('');
  };

  const chooseMode = (nextMode: MatchingMode) => {
    setMode(nextMode);
    clearRun();
  };

  const runMatching = async (exclusions = excluded, refinements = policies) => {
    const generation = ++runGenerationRef.current;
    const runScopeKey = scopeKey;
    const isCurrent = () => runGenerationRef.current === generation && currentScopeRef.current === runScopeKey;
    setError('');
    setQuickResults(null);
    setUnlinkedRun(null);
    setMatchAllGroups(null);
    setLoading(true);
    try {
      const candidateSource = new MyPropertiesMatchingSource(store);

      if (mode === 'saved' || scope.kind !== 'all') {
        const result = await runSavedMatchingScope({ scope, store, source: candidateSource, requirements, people, policies: refinements, excluded: exclusions });
        if (isCurrent()) {
          let groups = result.groups;
          if (best === '1') {
            const top = selectHomeMatches(result.selected, people, result.runs);
            const keys = new Set(top.map(item => JSON.stringify([item.result.requirementId,item.result.propertyId])));
            groups = groups.map(group => ({ ...group, requirementGroups: group.requirementGroups.map(request => ({ ...request, matches: request.matches.filter(item => keys.has(JSON.stringify([item.requirementId,item.propertyId]))), needsConfirmation: [] })).filter(request => request.matches.length) })).filter(group => group.requirementGroups.length);
          }
          setResultScopeKey(runScopeKey);
          setUnlinkedRun(result.unlinked);
          setMatchAllGroups(groups);
        }
        return;
      }

      const parsed = {minimum:numberFromInput(budgetText.minimum),maximum:numberFromInput(budgetText.maximum)};
      if (budgetText.minimum.trim() && parsed.minimum===undefined || budgetText.maximum.trim() && parsed.maximum===undefined) {
        setError(language==='ar'?'أدخل ميزانية صحيحة.':'Enter a valid budget.'); return;
      }
      const filters = {...quickFilters, minimumBudget:parsed.minimum, maximumBudget:parsed.maximum};
      if (!validQuickMatchingFilters(filters)) {
        setError(language==='ar'?'أدخل ميزانية أكبر من صفر، ويجب ألا يقل الحد الأعلى عن الحد الأدنى.':'Use a positive budget; the maximum must not be below the minimum.'); return;
      }
      const candidates = await candidateSource.getCandidates();
      const results = await runQuickMatching(filters, candidates, requirements, people, ()=>isCurrent());
      if (isCurrent()) { setQuickFilters(filters); setQuickResults(results); }
    } catch (runError) {
      console.error(runError);
      if (isCurrent()) setError(runError instanceof Error && runError.message === 'MATCHING_PROPERTY_NOT_FOUND' ? (language === 'ar' ? 'تعذر العثور على العقار المحدد. لم تُشغّل المطابقة العامة.' : 'The selected property is unavailable. General matching was not run.') : runError instanceof Error && runError.message === 'MATCHING_REQUIREMENT_NOT_FOUND' ? (language === 'ar' ? 'تعذر العثور على الطلب المحدد. لم تُشغّل المطابقة العامة.' : 'The selected request is unavailable. General matching was not run.') : t('matching.run_failed'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  };

  useEffect(() => {
    if (!pendingRestore) return;
    setPendingRestore(null);
    void runMatching();
  }, [pendingRestore]);

  const replaceSuggestion = (requirementId: string, propertyId: string) => {
    if (loading) return;
    const next = { ...excluded, [requirementId]: [...(excluded[requirementId] ?? []), propertyId] };
    setExcluded(next); void runMatching(next);
  };
  const refine = (requirementId: string, policy: MatchingPolicy) => {
    if (loading) return;
    const next = { ...policies, [requirementId]: policy };
    setPolicies(next); void runMatching(excluded, next);
  };

  const rememberResultLocation = () => {
    const token = rememberMatchingReturn({ scopeRequirementId: requestedRequirementId, scopePropertyId: requestedPropertyId, best: best === '1', mode, quickFilters: mode === 'quick' ? quickFilters : undefined, policies, excluded, layout: resultsLayout, scrollOffset: scrollOffsetRef.current });
    openedReturnTokenRef.current = token;
    return token;
  };
  const openMatchedPerson = (personId: string) => {
    rememberResultLocation();
    router.push(`/person/${encodeURIComponent(personId)}`);
  };
  const openMatchedRequest = (requirementId: string) => {
    const token = rememberResultLocation();
    router.push({ pathname: '/requirement/view/[requirementId]', params: { requirementId, matchingReturn: token } } as never);
  };

  const openMatchedProperty = async (propertyId: string) => {
    try {
      if (!await store.getProperty(propertyId)) {
        setError(t('matching.property_missing'));
        setQuickResults(null);
        setMatchAllGroups(null);
        return;
      }
      const token = rememberResultLocation();
      router.push({ pathname: '/property/[propertyCoreId]', params: { propertyCoreId: propertyId, matchingReturn: token } } as never);
    } catch {
      setError(t('matching.load_failed'));
    }
  };

  const resultGroups = resultScopeKey === scopeKey ? matchAllGroups : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('matching.title')} />
      <KeyboardAwareScrollViewCompat
        ref={scrollRef}
        onScroll={event => { scrollOffsetRef.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32}
        onContentSizeChange={() => { if (restoreOffsetRef.current !== null && (matchAllGroups || quickResults)) { const y = restoreOffsetRef.current; restoreOffsetRef.current = null; requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false })); } }}
        style={styles.scroll}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 112,
          paddingHorizontal: 20,
        }}
        bottomOffset={72}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {account && scope.kind === 'all' && <Button
          title={circleMode ? (language === 'ar' ? 'مطابقة مخزوني' : 'Match my inventory') : (language === 'ar' ? 'مطابقة دائرة الثقة' : 'Trust circle matching')}
          testID="matching-circle-mode" onPress={() => { clearRun(); setCircleMode(value => !value); }} />}
        {account && scope.kind === 'all' && circleMode
          ? <CircleMatchingPanel request={account.request} owner={account.profile.user_id}
              requirements={requirements} properties={properties} />
          : <>
        {scope.kind !== 'all' && <Button title={language === 'ar' ? 'مطابقة الكل' : 'Match all'} onPress={() => { clearRun(); setMode('saved'); setPolicies({}); setExcluded({}); currentScopeRef.current = '__changing_scope__'; matchAllRequested.current=true; router.setParams(matchingTarget({ kind: 'all' }).params); }} testID="matching-clear-scope" />}

        <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          <View style={styles.headerCopy}>
            <Text style={[styles.subtitle, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('matching.subtitle')}
            </Text>
          </View>
        </View>

        {scope.kind === 'all' && <View style={[styles.modeSwitch, { backgroundColor: colors.muted }]}>
          <TouchableOpacity
            onPress={() => chooseMode('saved')}
            style={[styles.modeButton, mode === 'saved' ? { backgroundColor: colors.card } : null]}
            testID="matching-mode-saved"
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'saved' }}
          >
            <Text style={[styles.modeText, { color: mode === 'saved' ? colors.primary : colors.mutedForeground, fontFamily: fonts.semiBold }]}>
              {t('matching.mode.saved')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => chooseMode('quick')}
            style={[styles.modeButton, mode === 'quick' ? { backgroundColor: colors.card } : null]}
            testID="matching-mode-quick"
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === 'quick' }}
          >
            <Text style={[styles.modeText, { color: mode === 'quick' ? colors.primary : colors.mutedForeground, fontFamily: fonts.semiBold }]}>
              {t('matching.mode.quick')}
            </Text>
          </TouchableOpacity>
        </View>}

        {mode === 'saved' || scope.kind !== 'all' ? (
          <View>
            <Text style={[styles.sectionTitle, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>
              {requestedPropertyId ? (language === 'ar' ? 'طلبات مناسبة لهذا العقار' : 'Client requests for this property') : requestedRequirementId ? (language === 'ar' ? 'عقارات مناسبة لهذا الطلب' : 'Properties for this request') : t('matching.saved.matchAllTitle')}
            </Text>
            <Text style={[styles.helper, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {scopedRecord ? (language === 'ar' ? 'النتائج تخص السجل المحدد فقط. اضغط مطابقة الكل لعرض باقي السجلات.' : 'Results are limited to this record. Choose Match all to include other records.') : requirements.length ? t('matching.saved.matchAllDescription') : t('matching.saved.empty')}
            </Text>
          </View>
        ) : (
          <QuickMatchingForm filters={quickFilters} budgetText={budgetText}
            onChange={next=>{clearRun();setQuickFilters(next);}}
            onBudgetChange={(key,value)=>{clearRun();setBudgetText(current=>({...current,[key]:value}));}} />
        )}

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.destructive }]} testID="matching-error">
            <Feather name="alert-circle" size={18} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.destructive, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {error}
            </Text>
          </View>
        ) : null}

        <Button
          title={loading
            ? t('matching.running')
            : mode === 'saved' && scope.kind === 'all' ? t('matching.runAll') : t('matching.run')}
          onPress={() => void runMatching()}
          loading={loading}
          disabled={loading || scope.kind === 'invalid'}
          style={styles.runButton}
          testID="matching-run"
        />

        {unlinkedRun && resultScopeKey === scopeKey && <View style={styles.resultsSection} testID="matching-unlinked-request"><Text style={{ color: colors.foreground, textAlign:isRTL?'right':'left',fontFamily:fonts.semiBold }}>{language==='ar'?'مطابقات الطلب غير المرتبط بشخص':'Matches for the unlinked request'}</Text>{[...unlinkedRun.run.matches,...unlinkedRun.run.needsConfirmation].map((result,index)=><MatchingResultCard key={result.propertyId} rank={index+1} result={result} requirement={unlinkedRun.requirement} property={properties.find(property=>property.core.id===result.propertyId)} onPress={()=>void openMatchedProperty(result.propertyId)} onViewRequirement={()=>openMatchedRequest(unlinkedRun.requirement.id)} />)}{!unlinkedRun.run.matches.length&&!unlinkedRun.run.needsConfirmation.length&&<Text style={{textAlign:isRTL?'right':'left'}}>{language==='ar'?'لا توجد مطابقات مناسبة حاليًا':'No suitable matches yet'}</Text>}</View>}
        {resultGroups && !unlinkedRun && <View style={styles.resultsSection} testID="matching-results">
          <View style={[styles.resultsHeader, { direction: 'ltr', flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={{ color: '#173F78', fontFamily: fonts.bold, fontSize: 19 }}>{t('matching.results.title')}</Text>
            <TouchableOpacity onPress={clearRun} testID="matching-clear" accessibilityRole="button"><Text style={{ color: '#2563EB', fontFamily: fonts.semiBold }}>{t('matching.clear')}</Text></TouchableOpacity>
          </View>
          {scopedRecord && !resultGroups.some(group => group.requirementGroups.some(request => request.matches.length || request.needsConfirmation.length)) && <Text testID="matching-scoped-empty" style={{ color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }}>{requestedPropertyId ? (language === 'ar' ? 'لا توجد طلبات مناسبة لهذا العقار حاليًا.' : 'No suitable client requests for this property yet.') : (language === 'ar' ? 'لا توجد عقارات مناسبة لهذا الطلب حاليًا.' : 'No suitable properties for this request yet.')}</Text>}
          <MatchingResultsGroups groups={resultGroups} properties={properties} layout={resultsLayout} onLayoutChange={setResultsLayout} policies={policies} busy={loading}
            onRefine={refine} onReplace={replaceSuggestion} onOpenProperty={id => void openMatchedProperty(id)}
            onShareProperty={(propertyId, personId) => router.push({ pathname: '/property/[propertyCoreId]/share', params: { propertyCoreId: propertyId, recipientId: personId } } as never)}
            onFollowup={(propertyId, personId) => router.push({ pathname: '/', params: { followupPersonId: personId, followupPropertyId: propertyId } } as never)}
            onOpenPerson={openMatchedPerson}
            onOpenRequest={openMatchedRequest} />
          <Text style={[styles.transientNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>{t('matching.results.transient')}</Text>
        </View>}
        {quickResults && scope.kind === 'all' && <View style={styles.resultsSection}>
          <TouchableOpacity onPress={clearRun} accessibilityRole="button" testID="matching-clear-quick"><Text style={{color:'#245DF4',fontFamily:fonts.semiBold}}>{t('matching.clear')}</Text></TouchableOpacity>
          <QuickMatchingResults key={JSON.stringify(quickFilters)} results={quickResults} layout={resultsLayout} onLayoutChange={setResultsLayout} onOpenProperty={id=>void openMatchedProperty(id)} onOpenPerson={openMatchedPerson} onOpenRequest={openMatchedRequest} />
        </View>}
        <Text style={[styles.thresholdNote, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
          {mode === 'quick' ? (language === 'ar' ? 'العقارات حسب الفلاتر، والعملاء حسب طلباتهم الحقيقية. النتائج مؤقتة ولا تُحفظ كطلبات جديدة.' : 'Properties follow the filters; clients follow their real requests. Results are temporary, not new saved requests.') : (language === 'ar' ? 'حتى ٥ ترشيحات لكل طلب؛ لا نملأ القائمة بنتائج ضعيفة.' : 'Up to 5 suggestions per request; weak results do not fill empty places.')}
        </Text>
        </>}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  header: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1 },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  modeSwitch: { flexDirection: 'row', borderRadius: 12, padding: 4, marginTop: 20, marginBottom: 22 },
  modeButton: { flex: 1, alignItems: 'center', borderRadius: 9, paddingVertical: 12 },
  modeText: { fontSize: 13 },
  sectionTitle: { fontSize: 19, lineHeight: 25, marginBottom: 5 },
  helper: { fontSize: 13, lineHeight: 19, marginBottom: 14 },
  errorBox: { alignItems: 'center', borderWidth: 1, borderRadius: 12, flexDirection: 'row', gap: 9, marginTop: 18, padding: 12 },
  errorText: { flex: 1, fontSize: 13, lineHeight: 18 },
  runButton: { marginTop: 22 },
  resultsSection: { marginTop: 24, width: '100%', maxWidth: 840, alignSelf: 'center' },
  resultsHeader: { alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  transientNote: { fontSize: 12, lineHeight: 17, marginTop: 14 },
  thresholdNote: { fontSize: 12, lineHeight: 17, marginTop: 22 },
});
