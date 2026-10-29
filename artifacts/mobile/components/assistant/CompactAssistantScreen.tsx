import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { MatchingResultCard } from '@/components/MatchingResultCard';
import { useAssistantHomeMatches } from '@/hooks/useAssistantHomeMatches';
import { HomeQuickAdd } from './HomeQuickAdd';
import { homeQuickRoute, homeGreetingPeriod, searchAssistantFollowups, type HomeQuickAction } from '@/services/assistantHome';
import { getRequirementCardSummary } from '@/services/cardSummaryPresentation';
import type { AssistantCopyKey } from '@/services/dailyAssistantCopy';
import { Action, AlertNote, AssistantField, AssistantSheet, AssistantText as Txt, CountBadge, useAssistantUI } from './ui';
import { assistantTone as c, s } from './styles';

type Mode = 'editor' | 'detail' | 'outcome' | 'reschedule' | 'calendar' | 'people' | 'properties' | 'person' | 'property' | 'settings' | 'cancel' | 'actions' | 'matches' | 'allTasks' | 'notifications' | 'requirements' | 'share' | null;
type CalendarTarget = 'page' | 'editor' | 'reschedule' | 'next';
const filters: TaskFilter[] = ['all', 'viewing', 'client', 'available', 'done', 'cancelled'];
function blankDraft(date: string, kind: TaskKind = 'call'): FollowupDraft {
  return { kind, title: '', date, time: '', duration: 45, personId: '', personName: '', propertyId: '', notes: '' };
}
function id() { return Crypto.randomUUID(); }
/** Only web scroll containment is CSS. Native scroll containers use bounded layouts + nested scrolling. */
const containedWebScroll = Platform.OS === 'web' ? { overscrollBehaviorY: 'contain', touchAction: 'pan-y', scrollbarGutter: 'stable' } as ViewStyle : undefined;
export default function CompactAssistantScreen() {
  const h = useDailyAssistant(), { language, setLanguage, t, isRTL } = useI18n();
  const { state: account } = useAccountFoundation(), { row, align, fonts } = useAssistantUI();
  const insets = useScreenInsets(), actualInsets = useSafeAreaInsets(), { width, height, fontScale } = useWindowDimensions(), router = useRouter();
  const C = h.copy, today = kuwaitDay(h.now);
  const matches = useAssistantHomeMatches(h.ready, h.catalog);
  const [allStatus, setAllStatus] = useState<'pending' | 'done' | 'cancelled' | 'all'>('pending');
  const [matchView, setMatchView] = useState<'people' | 'properties'>('people'), [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const params = useLocalSearchParams<{ followupId?: string }>(), openedFollowup = useRef<string | null>(null);
  useEffect(() => { const taskId = params.followupId; if (!taskId) { openedFollowup.current = null; return; } if (!h.ready || taskId === openedFollowup.current) return;
    openedFollowup.current = taskId; const task = h.state.tasks.find(t => t.id === taskId); if (task) { setExpected(task); setMode('detail'); } else h.notify(C('noSearch'));
    router.setParams({ followupId: undefined });
  }, [params.followupId, h.ready, h.state.tasks, C, router]);
  const listRef = useRef<React.ElementRef<typeof GestureScrollView>>(null);
  const [overdue, setOverdue] = useState(false);
  const [query, setQuery] = useState('');
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
  const rows = selectFollowups(h.state, h.inventory, h.selectedDay, 'all', '', overdue, today);
  const overdueTasks = sortFollowups(h.state.tasks.filter(v => v.status === 'pending' && v.date < today));
  const displayTask = expected ? h.state.tasks.find(v => v.id === expected.id) ?? expected : null;
  const listHeight = Math.max(180, Math.min(height * .4, 224));
  useEffect(() => { listRef.current?.scrollTo({ y: 0, animated: false }); }, [h.selectedDay, overdue]);
  const dateLabel = (day: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }) =>
    new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW-u-ca-gregory-nu-latn' : 'en-GB', { ...options, timeZone: ASSISTANT_TIME_ZONE }).format(new Date(day + 'T12:00:00Z'));
  const timeLabel = (time: string) => time ? new Intl.DateTimeFormat(language === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { timeZone: ASSISTANT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date('2026-01-01T' + time + ':00+03:00')) : C('allDay');
  const propertyTitle = (propertyId: string) => h.inventory.properties.find(p => p.id === propertyId)?.title ?? C('missingProperty');
  const personName = (task: Followup) => taskPersonName(task, h.inventory) || (task.personId ? C('missingPerson') : '');
  function chooseDay(day: string) { h.setSelectedDay(day); setOverdue(false); setQuery(''); }
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
  function quickAction(action: HomeQuickAction) {
    const href = homeQuickRoute(action);
    if (href) { setMode(null); router.push(href as never); }
    else if (action === 'share') { if (!h.ready) { h.notify(C(h.error ? 'loadError' : 'loading')); return; } setPickerQuery(''); setMode('share'); }
    else h.notify(C('importLater'));
  }
  function taskRow(task: Followup) {
    return <View key={task.id} style={[s.compactTask, { flexDirection: row }]} testID={`assistant-task-${task.id}`}>
      <Feather name={task.kind === 'call' ? 'phone' : task.kind === 'viewing' ? 'calendar' : task.kind === 'available' ? 'home' : 'edit-3'} color={c.blue} size={20} />
      <Pressable style={s.compactTaskOpen} accessibilityRole="button" accessibilityLabel={task.title} onPress={() => openDetail(task)}>
        <Text style={[s.compactTaskTitle, { fontFamily: fonts.semiBold, textAlign: align }]} numberOfLines={2}>{task.title}</Text>
        {!!personName(task) && <Txt muted size={12}>{personName(task)}</Txt>}
      </Pressable>
      <View style={s.compactTime}>{task.status === 'done' ? <Feather name="check-circle" size={18} color={c.green} /> : <Txt size={12} color={task.date < today ? c.red : c.muted}>{timeLabel(task.time)}</Txt>}{overdue && <Txt muted size={11}>{dateLabel(task.date, { day: 'numeric', month: 'short' })}</Txt>}</View>
    </View>;
  }
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
    modalTitle = C('settings'); modalBody = <><Txt muted>{C('settingsDescription')}</Txt><View style={[s.toggle, { flexDirection: row }]}><View style={s.grow}><Txt>{C('showOverdue')}</Txt></View><Switch accessibilityLabel={C('showOverdue')} value={preferences.showOverdue} onValueChange={showOverdue => setPreferences(p => ({ ...p, showOverdue }))} /></View><Txt muted>{C('localNote')}</Txt></>;
    modalFooter = <Footer save="save" onPress={() => void h.mutate(value => ({ ...value, settings: { ...value.settings, showOverdue: preferences.showOverdue } }), C('settingsSaved')).then(ok => { if (ok) close(); })} />;
  } else if (mode === 'cancel' && expected) {
    modalTitle = C('cancelTask'); modalBody = <Txt>{C('cancelQuestion')}</Txt>;
    modalFooter = <><View style={s.grow}><Action label={C('confirmCancel')} tone="danger" disabled={h.busy || !h.ready} onPress={() => void h.mutate((value, inventory) => changeTaskStatus(value, expected, 'cancelled', inventory, new Date().toISOString()), C('cancelledNotice')).then(ok => { if (ok) close(); })} /></View><Action label={C('back')} onPress={() => setMode('detail')} tone="quiet" /></>;
  } else if (mode === 'actions') {
    modalTitle = C('homeActions'); modalBody = <>{([
      ['call', 'phone', 'addCall'], ['viewing', 'calendar', 'addViewing'], ['meeting', 'users', 'clientMeeting'], ['available', 'home', 'addCheck'], ['note', 'edit-3', 'addNote'],
    ] as const).map(([kind, icon, label]) => <Action key={kind} label={C(label)} icon={icon} tone="quiet" disabled={!h.ready} onPress={() => openEditor(kind === 'meeting' ? 'note' : kind, undefined, kind === 'meeting' ? { title: C('clientMeeting') } : {})} />)}<Action label={C('settings')} icon="sliders" tone="quiet" disabled={!h.ready} onPress={() => { setPreferences(h.state.settings); setMode('settings'); }} /></>;
  } else if (mode === 'notifications') {
    modalTitle = C('notifications'); modalBody = overdueTasks.length ? <>{overdueTasks.map(taskRow)}</> : <Txt muted>{C('noNotifications')}</Txt>;
  } else if (mode === 'allTasks') {
    const tasks = sortFollowups(h.state.tasks.filter(task => allStatus === 'all' || task.status === allStatus));
    const shown = query.trim() ? searchAssistantFollowups(tasks, h.inventory, query) : tasks;
    modalTitle = C('allFollowups'); modalBody = <><AssistantField label={C('searchTasks')} value={query} onChangeText={setQuery} /><View style={[s.choiceRow, { flexDirection: row }]}>{(['pending', 'done', 'cancelled', 'all'] as const).map(status => <Action key={status} label={C(status === 'pending' ? 'homePending' : status === 'all' ? 'homeAll' : status === 'cancelled' ? 'cancelledFilter' : 'done')} tone={allStatus === status ? 'primary' : 'quiet'} onPress={() => setAllStatus(status)} />)}</View>{shown.slice(0, 50).map(task => <View key={task.id}>{taskRow(task)}<Txt muted size={12}>{dateLabel(task.date)}</Txt></View>)}{!shown.length && <Txt muted>{C('noSearch')}</Txt>}{shown.length > 50 && <Txt muted>{C('homeShowingFirst')}</Txt>}</>;
  } else if (mode === 'share') {
    const found = h.inventory.properties.filter(p => p.title.toLocaleLowerCase().includes(pickerQuery.trim().toLocaleLowerCase()));
    modalTitle = C('homeChooseProperty'); modalBody = <><AssistantField label={C('pickerSearch')} value={pickerQuery} onChangeText={setPickerQuery} />{found.slice(0, 50).map(p => <Action key={p.id} label={p.title} tone="quiet" icon="share-2" onPress={() => { close(); router.push(`/property/${encodeURIComponent(p.id)}/share` as never); }} />)}{!found.length && <Txt muted>{C('noRecords')}</Txt>}{found.length > 50 && <Txt muted>{C('homeShowingFirst')}</Txt>}</>;
  } else if (mode === 'requirements') {
    modalTitle = C('homeRequirements'); modalBody = h.catalog.requirements.length ? <>{h.catalog.requirements.map(req => {
      const summary = getRequirementCardSummary(req, { language, translate: t, formatPrice: (amount, currency) => formatPrice(amount, currency, language), formatRentalPrice: (amount, currency, period) => formatRentalPrice(amount, currency, period, language, t) });
      const person = h.catalog.people.find(p => p.id === req.seekerId);
      return <Pressable key={req.id} accessibilityRole="button" onPress={() => { close(); router.push({ pathname: '/requirement/view/[requirementId]', params: { requirementId: req.id } } as never); }} style={s.pickerRow}><Txt color={c.person} bold>{person?.name ?? C('missingPerson')}</Txt><Txt color={c.blue}>{[summary.subtypeLabel || summary.typeLabel, summary.areaLabel].filter(Boolean).join(' · ')}</Txt><Txt muted>{summary.valueLabel}</Txt></Pressable>;
    })}</> : <Txt muted>{C('homeEmptyRequirements')}</Txt>;
  } else if (mode === 'matches') {
    const groupIds = [...new Set(matches.items.map(item => matchView === 'people' ? item.person.id : item.result.propertyId))];
    modalTitle = C('bestHomeMatches'); modalBody = <><View style={[s.row, { flexDirection: row }]}><Action label={C('byPeople')} tone={matchView === 'people' ? 'primary' : 'quiet'} onPress={() => setMatchView('people')} /><Action label={C('byProperties')} tone={matchView === 'properties' ? 'primary' : 'quiet'} onPress={() => setMatchView('properties')} /></View><Txt muted size={12}>{C('homeMatchScope')}</Txt>{groupIds.map(groupId => <View key={groupId} style={s.homeMatchGroup}><Txt bold color={matchView === 'people' ? c.person : c.blue}>{matchView === 'people' ? matches.items.find(item => item.person.id === groupId)?.person.name : propertyTitle(groupId)}</Txt>{matches.items.filter(item => (matchView === 'people' ? item.person.id : item.result.propertyId) === groupId).map(item => {
      const key = JSON.stringify([item.person.id, item.result.propertyId]);
      return <MatchingResultCard key={key} rank={matches.items.indexOf(item) + 1} result={item.result} requirement={item.requirement} property={h.catalog.properties.find(p => p.core.id === item.result.propertyId)} personName={item.person.name} perspective={matchView} expanded={expandedMatch === key} onToggle={() => setExpandedMatch(expandedMatch === key ? null : key)} onPress={() => linkedPreview('property', item.result.propertyId)} onViewPerson={() => linkedPreview('person', item.person.id)} />;
    })}</View>)}{h.error && !h.ready ? <Txt color={c.red}>{C('loadError')}</Txt> : matches.status === 'loading' ? <ActivityIndicator color={c.blue} /> : matches.status === 'error' ? <AlertNote onRetry={matches.retry} retryLabel={C('retry')}>{C('homeMatchError')}</AlertNote> : !matches.items.length ? <Txt muted>{C('homeNoMatches')}</Txt> : null}</>;
    modalFooter = <View style={s.grow}><Action label={C('allMatches')} tone="primary" onPress={() => { close(); router.push('/matching' as never); }} /></View>;

  }
  const best = matches.items[0], profileName = account.profile.name.trim(), greeting = profileName ? C(homeGreetingPeriod(h.now)) + ' ' + profileName : C('defaultName');
  return <View style={s.root}><ScrollView testID="assistant-page-scroll" style={s.outer} keyboardShouldPersistTaps="handled" removeClippedSubviews={false} contentContainerStyle={{ paddingBottom: insets.bottom + 14 }}>
    <View testID="assistant-header" style={[s.homeHeader, { paddingTop: Platform.OS === 'web' ? actualInsets.top + 8 : insets.top }]}><View style={[s.homeHeaderInner, { flexDirection: row }]}><View style={[s.row, { flexDirection: row }]}><Feather name="home" size={25} color="white" /><Text style={[s.logo, { fontFamily: fonts.bold }]}>ViewState</Text></View><View style={[s.headerTools, { flexDirection: row }]}><Pressable style={s.language} accessibilityRole="button" accessibilityLabel={C('language')} onPress={() => setLanguage(language === 'ar' ? 'en' : 'ar')}><Text style={[s.headerSmall, { fontFamily: fonts.medium }]}>{language === 'ar' ? 'EN' : 'عربي'}</Text></Pressable><Pressable style={s.iconButton} accessibilityRole="button" accessibilityLabel={C('notifications') + ' · ' + (h.ready ? overdueTasks.length : '—')} onPress={() => setMode('notifications')} disabled={!h.ready}><Feather name="bell" size={21} color="white" />{h.ready && overdueTasks.length > 0 && <View style={s.homeBellBadge}><CountBadge count={overdueTasks.length} /></View>}</Pressable><Pressable style={s.iconButton} accessibilityRole="button" accessibilityLabel={t('more.title')} onPress={() => router.push('/more' as never)}><Feather name="settings" size={21} color="white" /></Pressable></View></View></View>
    <View style={s.homeContent}>
      <View style={[s.helloRow, { flexDirection: row }]}><View style={s.grow}><Text accessibilityRole="header" style={[s.helloTitle, { fontFamily: fonts.bold, textAlign: align }]}>{greeting}</Text><Txt muted size={13}>{C('homeQuestion')}</Txt></View><View style={s.homeDateTools}><Txt bold size={13}>{dateLabel(today, { weekday: 'long' })}</Txt><Txt muted size={11}>{dateLabel(today, { day: 'numeric', month: 'short', year: 'numeric' })}</Txt><View style={[s.row, { flexDirection: row, gap: 0 }]}><IconButton label={C('calendar')} name="calendar" onPress={() => openCalendar()} /><IconButton label={C('homeActions')} name="more-vertical" onPress={() => setMode('actions')} /></View></View></View>
      <Pressable testID="global-search-open" accessibilityRole="button" accessibilityLabel={C('homeSearch')} style={[s.homeSearch, { flexDirection: row }]} onPress={() => router.push('/search' as never)}><Feather name="search" size={19} color={c.blue} /><View style={s.grow}><Txt muted size={14}>{C('homeSearch')}</Txt></View></Pressable>
      {h.error && !mode ? <AlertNote onRetry={() => void h.reload()} retryLabel={C('retry')}>{h.error}</AlertNote> : null}
      {h.notice ? <View accessibilityLiveRegion="polite" style={[s.alert, { flexDirection: row, alignItems: 'center' }]}><View style={s.grow}><Txt color={c.red}>{h.notice}</Txt></View>{h.canUndo && <Action label={C('undo')} onPress={() => void h.undo()} tone="danger" disabled={h.busy} />}</View> : null}
      <HomeQuickAdd label={C('quickHomeAdd')} closeLabel={C('homeCloseMenu')} labels={{ person: C('homePerson'), property: C('homeProperty'), import: C('homeImport'), share: C('homeShare'), matching: C('homeMatching') }} onAction={quickAction} />
      <View style={s.homeMatchPanel} testID="home-best-matches"><View style={[s.row, { flexDirection: row, justifyContent: 'space-between' }]}><View style={s.grow}><View style={[s.row, { flexDirection: row, flexWrap: 'wrap' }]}><Txt bold size={16}>{C('bestHomeMatches')}</Txt>{matches.status === 'ready' && <CountBadge count={matches.items.length} />}</View>{matches.status === 'ready' && matches.items.length > 0 && <Txt muted size={12}>{matches.items.filter(item => item.result.score > 90).length + ' ' + C('aboveNinety')}</Txt>}</View><Action label={C('viewBestMatches')} onPress={() => setMode('matches')} tone="secondary" disabled={matches.status !== 'ready' || !matches.items.length} /></View>
        {h.error && !h.ready ? <Txt color={c.red}>{C('loadError')}</Txt> : matches.status === 'loading' ? <ActivityIndicator color={c.blue} /> : matches.status === 'error' ? <AlertNote onRetry={matches.retry} retryLabel={C('retry')}>{C('homeMatchError')}</AlertNote> : best ? <View style={[s.row, { flexDirection: row, justifyContent: 'space-between', marginTop: 10 }]}><View style={s.grow}><Pressable accessibilityRole="button" onPress={() => linkedPreview('person', best.person.id)}><Txt color={c.person} bold>{best.person.name}</Txt></Pressable><Pressable accessibilityRole="button" onPress={() => linkedPreview('property', best.result.propertyId)}><Txt color={c.blue} size={13}>{propertyTitle(best.result.propertyId)}</Txt></Pressable></View><Text style={[s.homeScore, { fontFamily: fonts.bold }]}>{best.result.score}%</Text></View> : <Txt muted>{C('homeNoMatches')}</Txt>}
      </View>
      <View style={[s.homeSectionBar, { flexDirection: row }]}><View style={[s.row, s.grow, { flexDirection: row }]}><Txt bold size={18}>{overdue ? C('overdueTitle') : h.selectedDay === today ? C('today') : dateLabel(h.selectedDay, { weekday: 'short', day: 'numeric', month: 'short' })}</Txt>{h.ready && <CountBadge count={rows.length} />}</View><Action label={C('allFollowups')} tone="quiet" onPress={() => { setQuery(''); setMode('allTasks'); }} disabled={!h.ready} /></View>
      {h.ready && h.state.settings.showOverdue && overdueTasks.length > 0 ? <View style={[s.row, { flexDirection: row, flexWrap: 'wrap' }]}><Feather name="alert-triangle" color={c.red} size={17} /><View style={s.grow}><Txt color={c.red} size={12}>{overdueTasks.length + ' ' + C('overdueNoun')}</Txt></View><Action label={C(overdue ? 'today' : 'review')} tone="danger" onPress={() => overdue ? chooseDay(today) : setOverdue(true)} /></View> : null}
      <View style={s.homeAgenda}><GestureScrollView ref={listRef} testID="assistant-task-list" accessibilityLabel={C('agendaDay')} disallowInterruption shouldActivateOnStart={Platform.OS === 'android'} bounces={false} overScrollMode="never" scrollsToTop={false} persistentScrollbar removeClippedSubviews={false} keyboardShouldPersistTaps="handled" style={[{ height: listHeight, flexGrow: 0 }, containedWebScroll]}>
        {!h.ready ? <View style={s.empty}>{h.error ? <Txt color={c.red}>{C('loadError')}</Txt> : <ActivityIndicator color={c.blue} />}</View> : rows.length ? rows.map(taskRow) : <View style={s.empty}><Feather name="check-circle" color={c.blue} size={26} /><Txt bold>{C('noTasks')}</Txt><Action label={C('addFollowup')} onPress={() => openEditor()} /></View>}
      </GestureScrollView></View>
      <Txt bold size={18}>{C('homeOverview')}</Txt><View style={[s.homeOverview, { flexDirection: row }]}>{[
        ['properties', h.catalog.properties.length, C('properties')], ['people', h.catalog.people.length, t('people.title')], ['requirements', h.catalog.requirements.length, C('homeRequirements')],
      ].map(([key, count, label]) => <Pressable key={key} style={s.homeStat} accessibilityRole="button" disabled={!h.ready} onPress={() => key === 'requirements' ? setMode('requirements') : router.push(('/' + key) as never)}><Text style={[s.homeStatValue, { fontFamily: fonts.medium }]}>{h.ready ? count : '—'}</Text><Txt muted size={13}>{label}</Txt></Pressable>)}</View>
    </View></ScrollView>
    {mode && <AssistantSheet title={modalTitle} onClose={close} busy={h.busy} footer={modalFooter}>{modalBody}{formError ? <AlertNote>{formError}</AlertNote> : null}{h.error ? <AlertNote onRetry={() => void h.reload()} retryLabel={C('retry')}>{h.error}</AlertNote> : null}</AssistantSheet>}
  </View>;
}
