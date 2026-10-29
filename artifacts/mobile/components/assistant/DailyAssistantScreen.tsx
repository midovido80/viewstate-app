import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Crypto from 'expo-crypto';
import { useI18n } from '@/contexts/I18nContext';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useDailyAssistant } from '@/hooks/useDailyAssistant';
import { store } from '@/services/persistence';
import { formatPrice, formatRentalPrice } from '@/constants/market';
import { openWhatsAppComposeWithOpener } from '@/services/whatsappCompose';
import {
  ASSISTANT_TIME_ZONE, OUTCOMES, acceptSuggestion, addDays, changeTaskStatus, clockMinutes,
  createFollowup, daySummary, editFollowup, kuwaitDay, logOutcome, monthGrid, selectFollowups,
  shiftMonth, sortFollowups, suggestFollowups, taskPersonName, validateDraft, type AssistantSuggestion,
  type Followup, type FollowupDraft, type Outcome, type TaskFilter, type TaskKind,
} from '@/services/dailyAssistant';
import type { AssistantCopyKey } from '@/services/dailyAssistantCopy';
import { Action, AlertNote, AssistantField, AssistantSheet, AssistantText as Txt, CountBadge, useAssistantUI } from './ui';
import { assistantTone as c, s } from './styles';

type Mode = 'editor' | 'detail' | 'outcome' | 'reschedule' | 'calendar' | 'people' | 'properties' | 'person' | 'property' | 'settings' | 'cancel' | null;
type CalendarTarget = 'page' | 'editor' | 'reschedule' | 'next';
const filters: TaskFilter[] = ['all', 'viewing', 'client', 'available', 'done', 'cancelled'];
function blankDraft(date: string, kind: TaskKind = 'call'): FollowupDraft {
  return { kind, title: '', date, time: '', duration: 45, personId: '', personName: '', propertyId: '', notes: '' };
}
function id() { return Crypto.randomUUID(); }
/** Only web scroll containment is CSS. Native scroll containers use bounded layouts + nested scrolling. */
const containedWebScroll = Platform.OS === 'web' ? { overscrollBehaviorY: 'contain', touchAction: 'pan-y', scrollbarGutter: 'stable' } as ViewStyle : undefined;
export default function DailyAssistantScreen() {
  const h = useDailyAssistant(), { language, setLanguage, t, isRTL } = useI18n();
  const { state: account } = useAccountFoundation(), { row, align, fonts } = useAssistantUI();
  const insets = useScreenInsets(), { width, height, fontScale } = useWindowDimensions(), router = useRouter();
  const C = h.copy, today = kuwaitDay(h.now), wide = width >= 940;
  const listRef = useRef<ScrollView>(null);
  const [filter, setFilter] = useState<TaskFilter>('all'), [overdue, setOverdue] = useState(false);
  const [query, setQuery] = useState(''), [searchOpen, setSearchOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(null), [expected, setExpected] = useState<Followup | null>(null);
  const [draft, setDraft] = useState<FollowupDraft>(() => blankDraft(today));
  const [formError, setFormError] = useState(''), [fieldError, setFieldError] = useState('');
  const [outcome, setOutcome] = useState<Outcome>('contacted'), [outcomeNotes, setOutcomeNotes] = useState('');
  const [nextEnabled, setNextEnabled] = useState(false), [nextDate, setNextDate] = useState(addDays(today, 1)), [nextTime, setNextTime] = useState(''), [nextTitle, setNextTitle] = useState('');
  const [newDate, setNewDate] = useState(today), [newTime, setNewTime] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(today.slice(0, 7) + '-01');
  const calendarTarget = useRef<CalendarTarget>('page'), calendarBack = useRef<Mode>(null);
  const pickerBack = useRef<Mode>(null);
  const [pickerQuery, setPickerQuery] = useState(''), [recordId, setRecordId] = useState('');
  const [preferences, setPreferences] = useState(h.state.settings);
  const rows = useMemo(() => selectFollowups(h.state, h.inventory, h.selectedDay, filter, query, overdue, today), [h.state, h.inventory, h.selectedDay, filter, query, overdue, today]);
  const summary = daySummary(h.state, h.inventory, h.selectedDay);
  const overdueTasks = sortFollowups(h.state.tasks.filter(v => v.status === 'pending' && v.date < today));
  const open = sortFollowups(h.state.tasks.filter(v => v.status === 'pending'));
  const due = open.find(v => v.date < today) ?? open.find(v => v.date === today) ?? open.find(v => v.date > today);
  const suggestions = suggestFollowups(h.state, h.inventory, today);
  const displayTask = expected ? h.state.tasks.find(v => v.id === expected.id) ?? expected : null;
  const listHeight = Math.max(230, Math.min(height * .52, 520));
  useEffect(() => { listRef.current?.scrollTo({ y: 0, animated: false }); }, [filter, query, h.selectedDay, overdue]);
  const dateLabel = (day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
    new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', { ...options, timeZone: ASSISTANT_TIME_ZONE }).format(new Date(day + 'T12:00:00Z'));
  const timeLabel = (time: string) => time ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { timeZone: ASSISTANT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date('2026-01-01T' + time + ':00+03:00')) : C('allDay');
  const propertyTitle = (propertyId: string) => h.inventory.properties.find(p => p.id === propertyId)?.title ?? C('missingProperty');
  const personName = (task: Followup) => taskPersonName(task, h.inventory) || (task.personId ? C('missingPerson') : '');
  function chooseDay(day: string) { h.setSelectedDay(day); setFilter('all'); setOverdue(false); setQuery(''); }
  function close() { if (h.busy) return; setMode(null); setFormError(''); setFieldError(''); }
  function openEditor(kind: TaskKind = 'call', task?: Followup, extra: Partial<FollowupDraft> = {}) {
    if (!h.ready || h.busy) return;
    setExpected(task ?? null); setDraft(task ? { ...task } : { ...blankDraft(h.selectedDay, kind), ...extra });
    setFormError(''); setFieldError(''); h.clearError(); setMode('editor');
  }
  function openDetail(task: Followup) { setExpected(task); setFormError(''); setMode('detail'); }
  function openOutcome(task: Followup) {
    if (task.status !== 'pending') return;
    setExpected(task); setOutcome(OUTCOMES[task.kind][0]); setOutcomeNotes(''); setNextEnabled(false);
    setNextDate(addDays(today, 1)); setNextTime(''); setNextTitle(C('followupDefault')); setFormError(''); setMode('outcome');
  }
  function openReschedule(task: Followup) {
    setExpected(task); setNewDate(addDays(task.date < today ? today : task.date, 1)); setNewTime(task.time); setFormError(''); setMode('reschedule');
  }
  function openCalendar(target: CalendarTarget = 'page') {
    calendarTarget.current = target; calendarBack.current = mode;
    const day = target === 'editor' ? draft.date : target === 'reschedule' ? newDate : target === 'next' ? nextDate : h.selectedDay;
    setCalendarMonth(day.slice(0, 7) + '-01'); setMode('calendar');
  }
  function pickDay(day: string) {
    if (calendarTarget.current === 'page') { chooseDay(day); setMode(null); }
    else { if (calendarTarget.current === 'editor') setDraft(d => ({ ...d, date: day })); if (calendarTarget.current === 'reschedule') setNewDate(day); if (calendarTarget.current === 'next') setNextDate(day); setMode(calendarBack.current); }
  }
  function openPicker(which: 'people' | 'properties') { pickerBack.current = mode; setPickerQuery(''); setMode(which); }
  async function pickRecord(which: 'people' | 'properties', targetId: string) {
    if (which === 'people') { setDraft(d => ({ ...d, personId: targetId, personName: '' })); setMode(pickerBack.current); return; }
    setDraft(d => ({ ...d, propertyId: targetId })); setMode(pickerBack.current);
    if (targetId && !draft.personId && !draft.personName && draft.kind === 'available') {
      try { const source = await store.getPropertySource(targetId); if (source && h.catalog.people.some(p => p.id === source.personId)) setDraft(d => d.propertyId === targetId && !d.personId && !d.personName ? { ...d, personId: source.personId } : d); }
      catch { h.notify(C('contactFirst')); }
    }
  }
  function validate(d: FollowupDraft, editingId?: string) {
    try { validateDraft(d, h.state, h.inventory, editingId); setFieldError(''); setFormError(''); return true; }
    catch (e) { setFieldError(e instanceof Error ? e.message : ''); setFormError(h.explain(e)); return false; }
  }
  async function saveEditor() {
    if (!validate(draft, expected?.id)) return;
    const at = new Date().toISOString(), newId = id();
    const saved = await h.mutate((value, inventory) => expected ? editFollowup(value, expected, draft, inventory, at) : createFollowup(value, draft, inventory, newId, at), C(expected ? 'updated' : 'newAdded'));
    if (saved) { chooseDay(draft.date); close(); }
  }
  async function saveOutcome() {
    if (!expected) return;
    let next: { draft: FollowupDraft; id: string } | undefined;
    if (nextEnabled) {
      next = { id: id(), draft: { ...blankDraft(nextDate, expected.kind === 'available' ? 'available' : 'call'), title: nextTitle, time: nextTime,
        personId: expected.personId, personName: expected.personName, propertyId: expected.propertyId } };
      if (!validate(next.draft)) return;
    }
    const at = new Date().toISOString();
    if (await h.mutate((value, inventory) => logOutcome(value, expected, outcome, outcomeNotes, at, inventory, next), C('outcomeSaved') + (next ? ' · ' + C('nextCreated') : ''))) close();
  }
  async function saveReschedule() {
    if (!expected) return; const value = { ...expected, date: newDate, time: newTime };
    if (!validate(value, expected.id)) return;
    if (await h.mutate((current, inventory) => editFollowup(current, expected, value, inventory, new Date().toISOString()), C('rescheduled'))) close();
  }
  async function contact(task: Followup, whatsapp: boolean) {
    const p = h.catalog.people.find(p => p.id === task.personId);
    if (!p) { h.notify(C('contactFirst')); return; }
    try {
      if (whatsapp) {
        const phone = p.normalizedPhone.replace(/\D/g, '');
        if (!phone) throw new Error();
        if (Platform.OS === 'web') await Linking.openURL(`https://wa.me/${encodeURIComponent(phone)}`);
        else await openWhatsAppComposeWithOpener(`phone=${encodeURIComponent(phone)}`, Linking);
      } else await Linking.openURL(`tel:${p.normalizedPhone}`);
    } catch { h.notify(C('contactError')); }
  }
  async function accept(suggestion: AssistantSuggestion) {
    const title = C(suggestion.kind === 'available' ? 'confirmProperty' : 'customerWaiting');
    const linked = suggestion.propertyId ? propertyTitle(suggestion.propertyId) : h.inventory.people.find(p => p.id === suggestion.personId)?.name ?? '';
    if (await h.mutate((value, inventory) => acceptSuggestion(value, inventory, today, suggestion.key, title + ' · ' + linked, id(), new Date().toISOString()), C('suggestAdded'), suggestion.propertyId || undefined)) chooseDay(today);
  }
  function linkedPreview(which: 'person' | 'property', targetId: string) { setRecordId(targetId); setMode(which); }
  function IconButton({ label, name, onPress }: { label: string; name: React.ComponentProps<typeof Feather>['name']; onPress: () => void }) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={s.iconButton}><Feather name={name} size={21} color={c.blue} /></Pressable>;
  }
  const Footer = ({ save, onPress }: { save: AssistantCopyKey; onPress: () => void }) => <>
    <View style={s.grow}><Action label={h.busy ? C('saveBusy') : C(save)} onPress={onPress} tone="primary" disabled={h.busy || !h.ready} /></View>
    <Action label={C('cancel')} onPress={close} tone="danger" disabled={h.busy} />
  </>;
  function DateControl({ value, target, label }: { value: string; target: CalendarTarget; label?: string }) {
    return <View style={s.field}><Txt bold>{label ?? C('date')}</Txt><Action icon="calendar" label={dateLabel(value)} onPress={() => openCalendar(target)} tone="quiet" /></View>;
  }
  function renderTimeControl({ value, onChange, required = false }: { value: string; onChange: (s: string) => void; required?: boolean }) {
    return <AssistantField label={C('time') + (required ? '' : ' · ' + C('optional'))} value={value} onChangeText={onChange} placeholder="09:30" maxLength={5}
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'} autoCorrect={false} autoCapitalize="none" error={fieldError === 'time' || fieldError === 'conflict' ? formError : undefined} style={{ textAlign: 'left', writingDirection: 'ltr' }} />;
  }
  function taskRow(task: Followup) {
    const pName = personName(task), selectedProperty = h.inventory.properties.find(p => p.id === task.propertyId);
    return <View key={task.id} style={s.task} testID={`assistant-task-${task.id}`}><View style={[s.taskCore, { flexDirection: row }]}>
      <View style={s.timeBox}><Text style={[s.time, { fontFamily: fonts.semiBold }]}>{task.time ? timeLabel(task.time).replace(/\s*(ص|م|am|pm)$/i, '') : '—'}</Text><Txt muted size={12}>{task.time ? timeLabel(task.time).replace(/[\d:٫\s]/g, '') : C('allDay')}</Txt></View>
      <View style={s.grow}><View style={[s.row, { flexDirection: row, flexWrap: 'wrap' }]}><View style={[s.chip, task.kind === 'viewing' && { backgroundColor: c.pale }]}><Text style={[s.chipText, { fontFamily: fonts.medium }]}>{C(task.kind)}</Text></View>
        {task.status === 'done' ? <Txt color={c.green} size={12}>{C('done')}</Txt> : task.status === 'cancelled' || task.date < today ? <Txt color={c.red} size={12}>{C(task.status === 'cancelled' ? 'cancelledFilter' : 'overdue')}</Txt> : null}
        {(query || overdue) && <Txt muted size={12}>{dateLabel(task.date, { day: 'numeric', month: 'short' })}</Txt>}</View>
        <Text style={[s.taskTitle, { fontFamily: fonts.semiBold, textAlign: align }]}>{task.title}</Text>
        <View style={[s.taskMeta, { flexDirection: row }]}>{pName ? <Pressable style={s.link} disabled={!task.personId} onPress={() => linkedPreview('person', task.personId)}><Text style={[s.person, { fontFamily: fonts.semiBold, textAlign: align }]}>{pName}</Text></Pressable> : null}
          {pName && task.propertyId ? <Txt muted>·</Txt> : null}{task.propertyId ? <Pressable style={s.link} disabled={!selectedProperty} onPress={() => linkedPreview('property', task.propertyId)}><Text style={[s.property, { fontFamily: fonts.regular, textAlign: align }]}>{selectedProperty?.title ?? C('missingProperty')}</Text></Pressable> : null}</View>
        {task.notes ? <Txt muted size={13}>{task.notes}</Txt> : null}
        <View style={[s.taskActions, { flexDirection: row }]}>{task.status === 'pending' && <><Action label={C('recordOutcome')} icon="check" onPress={() => openOutcome(task)} disabled={!h.ready || h.busy} /><Action label={C('reschedule')} onPress={() => openReschedule(task)} tone="quiet" disabled={!h.ready || h.busy} /></>}
          <IconButton label={C('details') + ' · ' + task.title} name="more-horizontal" onPress={() => openDetail(task)} /></View>
      </View></View></View>;
  }
  const calendarPanel = <View style={s.panel}><View style={[s.calendarBar, { flexDirection: row }]}>
    <Pressable style={[s.calendarCaption, { flexDirection: row }]} onPress={() => openCalendar()} accessibilityRole="button" accessibilityLabel={C('calendar')}><Txt bold>{dateLabel(h.selectedDay, { month: 'long', year: 'numeric' })}</Txt><Feather name="chevron-down" size={16} color={c.ink} /></Pressable>
    <Action label={C('today')} onPress={() => chooseDay(today)} tone="quiet" /><IconButton label={C('previousDay')} name={isRTL ? 'chevron-right' : 'chevron-left'} onPress={() => chooseDay(addDays(h.selectedDay, -1))} /><IconButton label={C('nextDay')} name={isRTL ? 'chevron-left' : 'chevron-right'} onPress={() => chooseDay(addDays(h.selectedDay, 1))} />
  </View>{wide && <View style={[s.dayGrid, { flexDirection: row, paddingHorizontal: 12, paddingBottom: 10 }]}>{monthGrid(h.selectedDay).filter(d => {
    const dow = new Date(h.selectedDay + 'T12:00:00Z').getUTCDay(), first = addDays(h.selectedDay, -dow); return d >= first && d < addDays(first, 7);
  }).map(d => <Pressable key={d} style={[s.dayCell, d === h.selectedDay && { backgroundColor: c.blue }]} onPress={() => chooseDay(d)}><Txt size={12} color={d === h.selectedDay ? 'white' : c.muted}>{dateLabel(d, { weekday: 'short' })}</Txt><Txt bold color={d === h.selectedDay ? 'white' : c.ink}>{Number(d.slice(-2))}</Txt></Pressable>)}</View>}</View>;
  const agendaPanel = <View style={s.panel} testID="assistant-agenda"><View style={s.agendaHead}><View style={[s.row, { flexDirection: row }]}><View style={s.grow}><Text style={[s.sectionTitle, { fontFamily: fonts.bold, textAlign: align }]}>{query ? C('searchResults') : overdue ? C('overdueTitle') : C('agenda') + ' · ' + dateLabel(h.selectedDay, { weekday: 'long', day: 'numeric', month: 'short' })}</Text></View><CountBadge count={rows.length} label={rows.length + ' ' + C('result')} /><IconButton label={C('searchTasks')} name="search" onPress={() => setSearchOpen(v => !v)} /></View>
    {searchOpen && <TextInput accessibilityLabel={C('searchTasks')} value={query} onChangeText={setQuery} placeholder={C('searchTasks')} placeholderTextColor={c.muted} style={[s.input, { fontFamily: fonts.regular, textAlign: align }]} />}
    {query ? <Txt muted size={12}>{C('searchScope')}</Txt> : null}</View>
    <View style={s.divider}><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.filters, { flexDirection: row }]}>{filters.map(key => {
      const count = selectFollowups(h.state, h.inventory, h.selectedDay, key, query, overdue, today).length;
      return <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === key }} key={key} onPress={() => setFilter(key)} style={[s.filter, { flexDirection: row, backgroundColor: filter === key ? c.pale : c.paper }]}>
        <Txt size={13} bold={filter === key}>{C(key === 'client' ? 'clientTasks' : key === 'cancelled' ? 'cancelledFilter' : key)}</Txt><CountBadge count={count} /></Pressable>;
    })}</ScrollView></View>
    <ScrollView ref={listRef} testID="assistant-task-list" accessibilityLabel={C('agendaDay')} nestedScrollEnabled bounces={false} overScrollMode="never" directionalLockEnabled
      scrollsToTop={false} persistentScrollbar removeClippedSubviews={false} keyboardShouldPersistTaps="handled" style={[s.taskList, { height: rows.length ? Math.min(listHeight, rows.length * 210 * Math.max(1, fontScale)) : 175 }, containedWebScroll]}>
      {!h.ready && !h.error ? <View style={s.empty}><ActivityIndicator color={c.blue} /><Txt muted>{C('loading')}</Txt></View> : !h.ready ? <View style={s.empty}><Txt color={c.red}>{C('loadError')}</Txt></View> : rows.length ? rows.map(taskRow) : <View style={s.empty}><Feather name="check-circle" color={c.blue} size={30} /><Txt bold>{C(query ? 'noSearch' : 'noTasks')}</Txt><Txt muted center>{C(query ? 'noSearchNote' : 'noTasksNote')}</Txt><Action label={C(query ? 'clearSearch' : 'addFollowup')} onPress={() => query ? setQuery('') : openEditor()} /></View>}
    </ScrollView></View>;
  const sidePanels = <>
    <View style={[s.panel, s.focus]}><View style={[s.row, { flexDirection: row, justifyContent: 'space-between' }]}><Txt muted size={13}>{C('priority')}</Txt><Txt muted size={12}>{new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { timeZone: ASSISTANT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(h.now)}</Txt></View>
      <Txt bold size={17}>{due?.title ?? C('freeDay')}</Txt><Txt muted>{due ? (due.date < today ? C('overdue') : C('nextAction')) + ' · ' + dateLabel(due.date, { day: 'numeric', month: 'short' }) + ' · ' + timeLabel(due.time) : C('createFirst')}</Txt>
      <View style={[s.row, { flexDirection: row, justifyContent: 'space-between' }]}><Txt muted size={12}>{C('kuwaitTime')}</Txt><Action label={C(due ? 'openTask' : 'addFollowup')} onPress={() => due ? openDetail(due) : openEditor()} tone="primary" disabled={!h.ready} /></View></View>
    <View style={[s.panel, s.panelPad]}><Txt bold size={18}>{C('suggestions')}</Txt>{suggestions.length ? suggestions.map(suggestion => <View key={suggestion.key} style={s.suggestion}>
      <Txt bold>{C(suggestion.kind === 'available' ? 'suggestProperty' : 'suggestPerson')}</Txt><Txt color={suggestion.kind === 'available' ? c.blue : c.person}>{suggestion.propertyId ? propertyTitle(suggestion.propertyId) : h.inventory.people.find(p => p.id === suggestion.personId)?.name}</Txt>
      <Txt muted size={13}>{C(suggestion.reason === 'unconfirmed' ? 'unconfirmedReason' : suggestion.reason === 'staleAvailability' ? 'staleAvailabilityReason' : 'staleContactReason').replace('{days}', String(suggestion.days ?? 0))}</Txt>
      <View style={[s.row, { flexDirection: row, flexWrap: 'wrap', justifyContent: 'space-between' }]}><Action label={C('scheduleIt')} icon="plus" onPress={() => void accept(suggestion)} disabled={h.busy || !h.ready} /><Action label={C('dismiss')} tone="quiet" disabled={h.busy} onPress={() => void h.mutate(value => ({ ...value, dismissed: [...value.dismissed, suggestion.key] }), C('suggestDismissed'))} /></View>
    </View>) : <Txt muted>{C(h.state.settings.showSuggestions ? 'noSuggestions' : 'suggestionsOff')}</Txt>}<Txt muted size={12}>{C('scopeNote')}</Txt></View>
    <View style={[s.panel, s.panelPad]}><View style={[s.row, { flexDirection: row, justifyContent: 'space-between' }]}><Txt bold size={18}>{C('dayProgress')}</Txt><Txt bold>{summary.done + ' / ' + summary.total}</Txt></View><View style={s.progress}><View style={[s.progressFill, { width: `${summary.total ? summary.done / summary.total * 100 : 0}%` }]} /></View><Txt muted>{C(!summary.total ? 'noDayWork' : summary.done === summary.total ? 'allComplete' : !summary.done ? 'zeroProgress' : 'dayWork')}</Txt></View>
    <View style={[s.panel, s.panelPad]}><Txt bold size={18}>{C('quickAdd')}</Txt><View style={[s.quickGrid, { flexDirection: row }]}>{(['call', 'viewing', 'available', 'note'] as const).map(kind => <View style={s.quickButton} key={kind}><Action label={C(kind === 'call' ? 'addCall' : kind === 'viewing' ? 'addViewing' : kind === 'available' ? 'addCheck' : 'addNote')} onPress={() => openEditor(kind)} disabled={!h.ready} icon={kind === 'call' ? 'phone' : kind === 'viewing' ? 'calendar' : kind === 'available' ? 'home' : 'edit-3'} tone="quiet" /></View>)}</View></View>
    <View style={[s.panel, s.panelPad]}><Txt bold size={18}>{C('shortcut')}</Txt><View style={[s.quickGrid, { flexDirection: row }]}>{[
      ['addProperty', 'home', '/capture/transaction'], ['addPerson', 'user-plus', '/person/new'], ['matches', 'target', '/matching'], ['import', 'download', ''],
    ].map(([label, ico, href]) => <View key={label} style={s.quickButton}><Action label={C(label as AssistantCopyKey)} icon={ico as 'home'} tone="quiet" onPress={() => href ? router.push(href as never) : h.notify(C('importLater'))} /></View>)}</View></View><Txt muted size={12}>{C('localNote')}</Txt>
  </>;
  let modalTitle: string = '', modalBody: React.ReactNode = null, modalFooter: React.ReactNode = null;
  if (mode === 'editor') {
    modalTitle = C(expected ? 'edit' : 'addFollowup');
    modalBody = <>
      <Txt bold>{C('type')}</Txt><View style={[s.choiceRow, { flexDirection: row }]}>{(['call', 'viewing', 'available', 'note'] as const).map(kind => <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: draft.kind === kind }} disabled={!!expected?.history.length && expected.kind !== kind} onPress={() => setDraft(d => ({ ...d, kind }))} style={[s.choice, draft.kind === kind && { backgroundColor: c.pale, borderColor: c.blue }]}><Txt>{C(kind)}</Txt></Pressable>)}</View>
      {!!expected?.history.length && <Txt muted size={12}>{C('editKindLocked')}</Txt>}
      <AssistantField label={C('title')} value={draft.title} onChangeText={title => setDraft(d => ({ ...d, title }))} placeholder={C('titlePlaceholder')} maxLength={140} error={fieldError === 'title' ? formError : undefined} />
      <DateControl value={draft.date} target="editor" />
      <View style={s.field}><Txt bold>{C('person')}</Txt><Action label={h.inventory.people.find(p => p.id === draft.personId)?.name ?? C('pickPerson')} onPress={() => openPicker('people')} tone="quiet" /></View>
      {!draft.personId && <><AssistantField label={C('contactName') + ' · ' + C('optional')} value={draft.personName} onChangeText={personName => setDraft(d => ({ ...d, personName }))} maxLength={100} /><Txt muted size={12}>{C('customNameHint')}</Txt></>}
      <View style={s.field}><Txt bold>{C('property')}</Txt><Action label={draft.propertyId ? propertyTitle(draft.propertyId) : C('pickProperty')} onPress={() => openPicker('properties')} tone="quiet" /></View>
      {renderTimeControl({ value: draft.time, onChange: time => setDraft(d => ({ ...d, time })), required: draft.kind === 'viewing' })}<Txt muted size={12}>{C(draft.kind === 'viewing' ? 'viewingRequiresTime' : 'allDayHint')}</Txt><Txt muted size={12}>{C('timeHint')}</Txt>
      {draft.kind === 'viewing' && <><Txt bold>{C('duration')}</Txt><View style={[s.choiceRow, { flexDirection: row }]}>{[30, 45, 60, 90, 120].map(duration => <Pressable key={duration} accessibilityRole="button" accessibilityState={{ selected: draft.duration === duration }} onPress={() => setDraft(d => ({ ...d, duration }))} style={[s.choice, duration === draft.duration && { backgroundColor: c.pale, borderColor: c.blue }]}><Txt>{duration + ' ' + C('minute')}</Txt></Pressable>)}</View></>}
      <AssistantField label={C('notes') + ' · ' + C('optional')} value={draft.notes} onChangeText={notes => setDraft(d => ({ ...d, notes }))} multiline maxLength={2000} placeholder={C('notesPlaceholder')} />
      {draft.kind === 'available' && <Txt muted>{C('propertyNote')}</Txt>}
    </>; modalFooter = <Footer save="saveFollowup" onPress={() => void saveEditor()} />;
  } else if (mode === 'outcome' && expected) {
    modalTitle = C('recordOutcome'); modalBody = <><View style={s.noteBox}><Txt bold>{expected.title}</Txt></View><Txt bold>{C('outcome')}</Txt><View style={[s.choiceRow, { flexDirection: row }]}>{OUTCOMES[expected.kind].map(value => <Pressable accessibilityRole="button" accessibilityState={{ selected: outcome === value }} key={value} onPress={() => setOutcome(value)} style={[s.choice, value === outcome && { backgroundColor: c.pale, borderColor: c.blue }]}><Txt>{C(value)}</Txt></Pressable>)}</View>
      <AssistantField label={C('notes') + ' · ' + C('optional')} value={outcomeNotes} onChangeText={setOutcomeNotes} multiline maxLength={2000} />{expected.kind === 'available' && <Txt muted>{C('propertyNote')}</Txt>}
      <View style={[s.toggle, { flexDirection: row }]}><View style={s.grow}><Txt>{C('newFollowup')}</Txt></View><Switch accessibilityLabel={C('newFollowup')} value={nextEnabled} onValueChange={setNextEnabled} /></View>
      {nextEnabled && <><DateControl value={nextDate} target="next" label={C('nextDate')} />{renderTimeControl({ value: nextTime, onChange: setNextTime })}<AssistantField label={C('nextStep')} value={nextTitle} onChangeText={setNextTitle} maxLength={140} /></>}
    </>; modalFooter = <Footer save="saveOutcome" onPress={() => void saveOutcome()} />;
  } else if (mode === 'reschedule' && expected) {
    modalTitle = C('reschedule'); modalBody = <><Txt bold>{expected.title}</Txt><DateControl value={newDate} target="reschedule" />{renderTimeControl({ value: newTime, onChange: setNewTime, required: expected?.kind === 'viewing' })}<Txt muted>{C('timeHint')}</Txt></>;
    modalFooter = <Footer save="saveNewDate" onPress={() => void saveReschedule()} />;
  } else if (mode === 'detail' && displayTask) {
    const task = displayTask;
    modalTitle = C('details'); modalBody = <><View style={s.noteBox}><Txt bold size={18}>{task.title}</Txt><Txt>{dateLabel(task.date) + ' · ' + timeLabel(task.time)}</Txt><Txt color={task.status === 'cancelled' ? c.red : task.status === 'done' ? c.green : c.muted}>{C(task.status === 'pending' ? task.kind : task.status === 'done' ? 'done' : 'cancelledFilter')}</Txt></View>
      {!!personName(task) && <Pressable style={s.pickerRow} disabled={!task.personId} onPress={() => linkedPreview('person', task.personId)}><Txt color={c.person} bold>{personName(task)}</Txt></Pressable>}
      {!!task.propertyId && <Pressable style={s.pickerRow} onPress={() => linkedPreview('property', task.propertyId)}><Txt color={c.blue}>{propertyTitle(task.propertyId)}</Txt></Pressable>}
      {!!task.notes && <Txt>{task.notes}</Txt>}{task.kind === 'viewing' && <View style={s.noteBox}><Txt bold>{C('viewingPrep')}</Txt><Txt muted>{C('prepText')}</Txt></View>}
      {!!task.personId && <><View style={[s.choiceRow, { flexDirection: row }]}><Action label={C('phone')} icon="phone" tone="success" onPress={() => void contact(task, false)} /><Action label={C('whatsapp')} icon="message-circle" tone="success" onPress={() => void contact(task, true)} /></View><Txt muted size={12}>{C('contactHint')}</Txt></>}
      <View style={[s.choiceRow, { flexDirection: row }]}>{task.status === 'pending' ? <><Action label={C('edit')} icon="edit-3" tone="quiet" onPress={() => openEditor(task.kind, task)} /><Action label={C('cancelTask')} tone="danger" onPress={() => { setExpected(task); setMode('cancel'); }} /></> : <Action label={C('restore')} tone="quiet" disabled={!h.ready || h.busy} onPress={() => void h.mutate((value, inventory) => changeTaskStatus(value, task, 'pending', inventory, new Date().toISOString()), C('restored')).then(ok => { if (ok) close(); })} />}</View>
      <Txt bold>{C('history')}</Txt>{task.history.length ? [...task.history].reverse().map((entry, i) => <View key={entry.at + i} style={s.noteBox}><Txt bold>{C(entry.outcome)}</Txt><Txt muted size={12}>{dateLabel(kuwaitDay(new Date(entry.at)))}</Txt>{!!entry.notes && <Txt>{entry.notes}</Txt>}</View>) : <Txt muted>{C('noHistory')}</Txt>}
    </>; if (task.status === 'pending') modalFooter = <><View style={s.grow}><Action label={C('recordOutcome')} tone="primary" onPress={() => openOutcome(task)} /></View><Action label={C('reschedule')} onPress={() => openReschedule(task)} tone="quiet" /></>;
  } else if (mode === 'calendar') {
    modalTitle = C('chooseDate'); const selected = calendarTarget.current === 'editor' ? draft.date : calendarTarget.current === 'reschedule' ? newDate : calendarTarget.current === 'next' ? nextDate : h.selectedDay;
    modalBody = <><View style={[s.row, { flexDirection: row, justifyContent: 'space-between' }]}><IconButton label={C('previousMonth')} name={isRTL ? 'chevron-right' : 'chevron-left'} onPress={() => setCalendarMonth(d => shiftMonth(d, -1))} /><Txt bold size={18}>{dateLabel(calendarMonth, { month: 'long', year: 'numeric' })}</Txt><IconButton label={C('nextMonth')} name={isRTL ? 'chevron-left' : 'chevron-right'} onPress={() => setCalendarMonth(d => shiftMonth(d, 1))} /></View>
      <View style={[s.dayGrid, { flexDirection: row }]}>{Array.from({ length: 7 }, (_, i) => <View key={i} style={s.dayCell}><Txt muted size={12}>{dateLabel(addDays('2026-10-25', i), { weekday: 'short' })}</Txt></View>)}{monthGrid(calendarMonth).map(day => {
        const count = h.state.tasks.filter(v => v.date === day && v.status === 'pending').length;
        return <Pressable key={day} accessibilityRole="button" accessibilityLabel={dateLabel(day)} accessibilityState={{ selected: selected === day }} style={[s.dayCell, day === selected && { backgroundColor: c.blue }, day === today && { borderWidth: 1, borderColor: c.blue }]} onPress={() => pickDay(day)}><Txt color={day === selected ? '#FFFFFF' : day.slice(0, 7) !== calendarMonth.slice(0, 7) ? c.muted : c.ink}>{Number(day.slice(-2))}</Txt>{count ? <CountBadge count={count} /> : null}</Pressable>;
      })}</View><Txt muted size={12}>{C('noteDate')}</Txt></>;
    modalFooter = <><View style={s.grow}><Action label={C('today')} onPress={() => pickDay(today)} tone="primary" /></View><Action label={C('back')} onPress={() => setMode(calendarBack.current)} tone="quiet" /></>;
  } else if (mode === 'people' || mode === 'properties') {
    const which = mode, list = which === 'people' ? h.inventory.people.map(p => ({ id: p.id, name: p.name })) : h.inventory.properties.map(p => ({ id: p.id, name: p.title }));
    const found = list.filter(p => p.name.toLocaleLowerCase().includes(pickerQuery.trim().toLocaleLowerCase()));
    modalTitle = C(which === 'people' ? 'pickPerson' : 'pickProperty'); modalBody = <><AssistantField label={C('pickerSearch')} value={pickerQuery} onChangeText={setPickerQuery} /><Action label={C('none')} tone="quiet" onPress={() => void pickRecord(which, '')} />{found.slice(0, 50).map(item => <Pressable key={item.id} style={s.pickerRow} accessibilityRole="button" onPress={() => void pickRecord(which, item.id)}><Txt color={which === 'people' ? c.person : c.blue}>{item.name}</Txt></Pressable>)}{!found.length && <Txt muted>{C('noRecords')}</Txt>}{found.length > 50 && <Txt muted>{C('pickerLimit')}</Txt>}</>;
    modalFooter = <Action label={C('back')} tone="quiet" onPress={() => setMode(pickerBack.current)} />;
  } else if (mode === 'person') {
    const p = h.catalog.people.find(p => p.id === recordId); modalTitle = C('person');
    modalBody = p ? <><Txt bold size={19} color={c.person}>{p.name}</Txt><Txt>{p.displayPhone}</Txt><Txt muted>{p.notes}</Txt><Txt bold>{C('linkedTasks')}</Txt>{sortFollowups(h.state.tasks.filter(v => v.personId === recordId && v.status === 'pending')).map(task => <Pressable key={task.id} style={s.pickerRow} onPress={() => openDetail(task)}><Txt>{task.title}</Txt><Txt muted size={12}>{dateLabel(task.date) + ' · ' + timeLabel(task.time)}</Txt></Pressable>)}</> : <AlertNote>{C('missingPerson')}</AlertNote>;
    modalFooter = <View style={s.grow}><Action label={C('addForPerson')} tone="primary" onPress={() => openEditor('call', undefined, { personId: recordId })} disabled={!p} /></View>;
  } else if (mode === 'property') {
    const p = h.catalog.properties.find(p => p.core.id === recordId), a = h.state.availability[recordId]; modalTitle = C('property');
    modalBody = p ? <><Txt bold size={19}>{propertyTitle(recordId)}</Txt><Txt>{p.activeOffer.transaction === 'rent' ? formatRentalPrice(p.activeOffer.rentalPrice.amount, p.activeOffer.rentalPrice.currencyCode, p.activeOffer.rentalPeriodId, language, t) : formatPrice(p.activeOffer.salePrice.amount, p.activeOffer.salePrice.currencyCode, language)}</Txt>
      <Txt bold color={a?.status === 'unavailable' ? c.red : a?.status === 'available' ? c.green : c.muted}>{C(a?.status === 'available' ? 'availableLabel' : a?.status === 'unavailable' ? 'unavailableLabel' : 'unknown')}</Txt><Txt muted>{C('lastAvailability') + ' · ' + (a ? dateLabel(kuwaitDay(new Date(a.at))) : C('noCheck'))}</Txt><Txt muted size={12}>{C('confirmationOnly')}</Txt><Txt bold>{C('linkedTasks')}</Txt>
      {sortFollowups(h.state.tasks.filter(v => v.propertyId === recordId && v.status === 'pending')).map(task => <Pressable key={task.id} style={s.pickerRow} onPress={() => openDetail(task)}><Txt>{task.title}</Txt><Txt muted size={12}>{dateLabel(task.date) + ' · ' + timeLabel(task.time)}</Txt></Pressable>)}</> : <AlertNote>{C('missingProperty')}</AlertNote>;
    modalFooter = <View style={s.grow}><Action label={C('addForProperty')} tone="primary" disabled={!p} onPress={() => openEditor('available', undefined, { propertyId: recordId, title: C('confirmProperty') })} /></View>;
  } else if (mode === 'settings') {
    modalTitle = C('settings'); modalBody = <><Txt muted>{C('settingsDescription')}</Txt>{(['showSuggestions', 'showOverdue'] as const).map(key => <View key={key} style={[s.toggle, { flexDirection: row }]}><View style={s.grow}><Txt>{C(key)}</Txt></View><Switch accessibilityLabel={C(key)} value={preferences[key]} onValueChange={value => setPreferences(p => ({ ...p, [key]: value }))} /></View>)}<Txt bold>{C('checkDays')}</Txt><View style={[s.choiceRow, { flexDirection: row }]}>{[3, 7, 14].map(days => <Pressable key={days} accessibilityRole="button" accessibilityState={{ selected: preferences.checkAfterDays === days }} onPress={() => setPreferences(p => ({ ...p, checkAfterDays: days }))} style={[s.choice, preferences.checkAfterDays === days && { backgroundColor: c.pale }]}><Txt>{days + ' ' + C('days')}</Txt></Pressable>)}</View><Txt muted>{C('localNote')}</Txt></>;
    modalFooter = <Footer save="save" onPress={() => void h.mutate(value => ({ ...value, settings: preferences }), C('settingsSaved')).then(ok => { if (ok) close(); })} />;
  } else if (mode === 'cancel' && expected) {
    modalTitle = C('cancelTask'); modalBody = <Txt>{C('cancelQuestion')}</Txt>;
    modalFooter = <><View style={s.grow}><Action label={C('confirmCancel')} tone="danger" disabled={h.busy || !h.ready} onPress={() => void h.mutate((value, inventory) => changeTaskStatus(value, expected, 'cancelled', inventory, new Date().toISOString()), C('cancelledNotice')).then(ok => { if (ok) close(); })} /></View><Action label={C('back')} onPress={() => setMode('detail')} tone="quiet" /></>;
  }
  return <View style={s.root}><ScrollView testID="assistant-page-scroll" style={s.outer} nestedScrollEnabled keyboardShouldPersistTaps="handled" removeClippedSubviews={false} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
    <View testID="assistant-header" style={[s.header, { paddingTop: insets.top + 5 }]}><View style={[s.headerRow, { flexDirection: row }]}><View style={[s.row, { flexDirection: row }]}><Feather name="home" color="white" size={25} /><Text style={[s.logo, { fontFamily: fonts.bold }]}>ViewState</Text></View><View style={[s.headerTools, { flexDirection: row }]}><Pressable style={s.language} accessibilityRole="button" accessibilityLabel={C('language')} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}><Text style={[s.headerSmall, { fontFamily: fonts.medium }]}>{language === 'ar' ? 'EN' : 'عربي'}</Text></Pressable><Pressable style={s.avatar} accessibilityRole="button" accessibilityLabel={t('more.title')} onPress={() => router.push('/more' as never)}><Txt bold color={c.navy}>{account.profile.name.trim().slice(0, 1) || 'V'}</Txt></Pressable></View></View>
      <Pressable testID="global-search-open" accessibilityRole="button" accessibilityLabel={t('search.open')} style={[s.search, { flexDirection: row }]} onPress={() => router.push('/search' as never)}><Feather name="search" color={c.muted} size={18} /><View style={s.grow}><Txt muted>{t('common.search')}</Txt></View></Pressable></View>
    <View style={s.content}><View style={[s.headingRow, { flexDirection: row }]}><View style={s.grow}><Text accessibilityRole="header" style={[s.title, { fontFamily: fonts.bold, textAlign: align }]}>{C('greeting')}</Text><Text style={[s.date, { fontFamily: fonts.regular, textAlign: align }]}>{dateLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text></View><Action label={C('addFollowup')} onPress={() => openEditor()} icon="plus" tone="primary" disabled={!h.ready || h.busy} /></View>
      {h.error && !mode ? <AlertNote onRetry={() => void h.reload()} retryLabel={C('retry')}>{h.error}</AlertNote> : null}
      {h.notice ? <View accessibilityLiveRegion="polite" style={[s.alert, { flexDirection: row, alignItems: 'center' }]}><View style={s.grow}><Txt color={c.red}>{h.notice}</Txt></View>{h.canUndo && <Action label={C('undo')} onPress={() => void h.undo()} tone="danger" disabled={h.busy} />}</View> : null}
      <View style={[s.panel, s.summary, { flexDirection: row }]}>{[
        ['client', C(wide ? 'clients' : 'clientsShort'), summary.clients, C('distinctPeople')], ['viewing', C('viewings'), summary.viewings, C('appointments')],
        ['available', C(wide ? 'availability' : 'availabilityShort'), summary.availability, C('properties')], ['done', C(wide ? 'completed' : 'completedShort'), summary.done, C('tasks')],
      ].map(([key, label, count, hint], index) => <Pressable key={key} style={[s.stat, index < 3 && { borderEndWidth: 1, borderColor: c.line }]} accessibilityRole="button" accessibilityLabel={`${label}: ${h.ready ? count : '—'}`} onPress={() => { setFilter(key as TaskFilter); setOverdue(false); setQuery(''); }}><Text style={[s.statLabel, { fontFamily: fonts.regular }]}>{label}</Text>{h.ready ? <CountBadge count={count as number} /> : <Txt>—</Txt>}<Text style={[s.statHint, { fontFamily: fonts.regular }]}>{hint}</Text></Pressable>)}</View>
      <View style={wide ? [s.twoColumns, { flexDirection: row }] : { gap: 14 }}><View style={wide ? s.mainColumn : { gap: 14 }}>{calendarPanel}
        {h.ready && h.state.settings.showOverdue && overdueTasks.length ? <View style={[s.alert, { flexDirection: row, alignItems: 'center' }]}><Feather name="alert-triangle" color={c.red} size={20} /><CountBadge count={overdueTasks.length} /><View style={s.grow}><Txt color={c.red} bold>{C('overdueNoun')}</Txt></View><Action label={C('review')} tone="danger" onPress={() => { setOverdue(true); setFilter('all'); setQuery(''); }} /></View> : null}
        {agendaPanel}</View><View style={wide ? s.sideColumn : { gap: 14 }}>{h.ready ? sidePanels : <View style={[s.panel, s.panelPad]}><Txt muted>{C(h.error ? 'loadError' : 'loading')}</Txt></View>}<Action label={C('settings')} icon="sliders" tone="quiet" disabled={!h.ready} onPress={() => { setPreferences(h.state.settings); setMode('settings'); }} /></View></View>
    </View></ScrollView>
    {mode && <AssistantSheet title={modalTitle} onClose={close} busy={h.busy} footer={modalFooter}>{modalBody}{formError ? <AlertNote>{formError}</AlertNote> : null}{h.error ? <AlertNote onRetry={() => void h.reload()} retryLabel={C('retry')}>{h.error}</AlertNote> : null}</AssistantSheet>}
  </View>;
}
