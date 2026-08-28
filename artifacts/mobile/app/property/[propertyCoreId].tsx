import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Property, PROPERTY_TYPES, PropertyType, Transaction } from '@workspace/property-domain';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { formatPrice, formatRentalCadence, formatRentalPrice, MARKET_CONFIG } from '@/constants/market';
import { getAreaById, searchAreas } from '@/constants/kuwait-areas';
import { store } from '@/services/persistence';
import { deleteSavedProperty } from '@/services/propertyDeletion';
import {
  PropertyEditDraftV1,
  buildPropertyUpdateCandidate,
  createEditDraft,
  createPropertyUpdateOperation,
  discardPropertyEditDraft,
  exactPropertyEqual,
  executePropertyUpdateRecovery,
  loadPropertyEditDraft,
  loadPropertyUpdateOperation,
  flushPropertyEditDraftWrites,
  PendingPropertyUpdateExistsError,
  PropertyUpdateOperationV1,
  PropertyUpdateRecoveryResult,
  persistPropertyUpdateOperation,
  savePropertyEditDraft,
} from '@/services/propertyUpdateRecovery';

export default function PropertyDetailScreen() {
  const { propertyCoreId } = useLocalSearchParams<{ propertyCoreId?: string | string[] }>();
  const id = Array.isArray(propertyCoreId) ? propertyCoreId[0] : propertyCoreId;
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, language, isRTL, fonts } = useI18n();
  const [property, setProperty] = useState<Property | null>(null);
  const [draft, setDraft] = useState<PropertyEditDraftV1 | null>(null);
  const draftRef = useRef<PropertyEditDraftV1 | null>(null);
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'unreadable'>('loading');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);
  const [areaSearch, setAreaSearch] = useState('');
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PropertyUpdateOperationV1 | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<PropertyUpdateRecoveryResult['status'] | null>(null);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const canPermanentlyDelete = store.canPermanentlyDelete();

  const load = useCallback(async () => {
    if (!id) {
      setStatus('missing');
      return;
    }
    setStatus('loading');
    try {
      const pending = await loadPropertyUpdateOperation();
      if (pending) {
        if (pending.baseline.core.id === id) {
          const recovered = await executePropertyUpdateRecovery({
            operation: pending,
            allowUpdate: false,
            getProperty: value => store.getProperty(value),
            compareAndUpdate: (baseline, candidate) => store.compareAndUpdate(baseline, candidate),
          });
          if (recovered.status === 'complete') {
            setPendingOperation(null);
            setRecoveryStatus(null);
          } else {
            setPendingOperation(pending);
            setRecoveryStatus(recovered.status);
            setError(
              recovered.status === 'retry_required' ? t('edit.recovery_retry')
                : recovered.status === 'cleanup_failed' ? t('edit.recovery_cleanup')
                  : recovered.status === 'conflict' ? t('edit.recovery_conflict') : t('edit.recovery_update_failed'),
            );
          }
        }
      } else {
        setPendingOperation(null);
        setRecoveryStatus(null);
      }
      const saved = await store.getProperty(id);
      if (!saved) {
        setProperty(null);
        setStatus('missing');
        return;
      }
      setProperty(saved);
      setStatus('ready');
    } catch {
      setProperty(null);
      setStatus('unreadable');
    }
  }, [id, t]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const areaName = (areaId: string) => {
    const area = getAreaById(areaId);
    return area ? (language === 'ar' ? area.ar : area.en) : areaId;
  };

  const beginEdit = async () => {
    if (!property || !id) return;
    setError('');
    if (!store.canSafelyUpdate()) {
      setError(t('edit.unsupported'));
      return;
    }
    try {
      const pending = await loadPropertyUpdateOperation();
      if (pending) {
        setError(pending.baseline.core.id === id ? t('edit.recovery_retry') : t('edit.recovery_pending'));
        return;
      }
      const existing = await loadPropertyEditDraft(id);
      if (existing && !exactPropertyEqual(existing.baseline, property)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const next = existing ?? createEditDraft(property);
      if (!existing && !await savePropertyEditDraft(next)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      setDraft(next);
      draftRef.current = next;
      setMode('edit');
    } catch {
      setError(t('edit.draft_unreadable'));
    }
  };

  const updateChoices = (changes: Partial<PropertyEditDraftV1['choices']>) => {
    const previous = draftRef.current;
    if (!previous) return;
    const next = {
      ...previous,
      choices: { ...previous.choices, ...changes },
      writeGeneration: previous.writeGeneration + 1,
    };
    draftRef.current = next;
    setDraft(next);
    void savePropertyEditDraft(next, previous)
      .then(saved => {
        if (!saved) setError(t('edit.draft_conflict'));
      })
      .catch(() => setError(t('edit.draft_unreadable')));
  };

  const selectTransaction = (transaction: Transaction) => {
    if (!draft || transaction === draft.choices.transaction) return;
    setError('');
    updateChoices({
      transaction,
      priceAmount: undefined,
      ...(transaction === 'rent' && draft.baseline.activeOffer.transaction === 'sale'
        ? { rentalPeriodId: MARKET_CONFIG.defaultRentalPeriodId }
        : {}),
    });
  };

  const retryRecovery = async (allowUpdate: boolean) => {
    if (!pendingOperation || saving) return;
    setSaving(true);
    try {
      const result = await executePropertyUpdateRecovery({
        operation: pendingOperation,
        allowUpdate,
        getProperty: value => store.getProperty(value),
        compareAndUpdate: (baseline, candidate) => store.compareAndUpdate(baseline, candidate),
      });
      if (result.status === 'complete') {
        const saved = await store.getProperty(pendingOperation.baseline.core.id);
        setProperty(saved);
        setPendingOperation(null);
        setRecoveryStatus(null);
        setDraft(null);
        draftRef.current = null;
        setError('');
        setMode('detail');
      } else {
        setRecoveryStatus(result.status);
        setError(
          result.status === 'conflict' ? t('edit.recovery_conflict')
            : result.status === 'cleanup_failed' ? t('edit.recovery_cleanup')
              : result.status === 'retry_required' ? t('edit.recovery_retry')
                : t('edit.recovery_update_failed'),
        );
      }
    } catch {
      setError(t('edit.recovery_update_failed'));
    } finally {
      setSaving(false);
    }
  };

  const leaveEditor = () => {
    if (!draft) {
      setMode('detail');
      return;
    }
    setLeaveVisible(true);
  };

  const discardEditDraft = async () => {
    const current = draftRef.current;
    if (!current || discarding) return;
    setDiscarding(true);
    try {
      const discarded = await discardPropertyEditDraft(current.propertyCoreId, current);
      setLeaveVisible(false);
      if (!discarded) {
        setError(t('edit.draft_conflict'));
        return;
      }
      setDraft(null);
      draftRef.current = null;
      setMode('detail');
    } catch {
      setLeaveVisible(false);
      setError(t('edit.draft_unreadable'));
    } finally {
      setDiscarding(false);
    }
  };

  const save = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      const pending = await loadPropertyUpdateOperation();
      if (pending) {
        if (pending.baseline.core.id !== draft.propertyCoreId) {
          setError(t('edit.recovery_conflict'));
          return;
        }
        const retry = await executePropertyUpdateRecovery({
          operation: pending,
          allowUpdate: true,
          getProperty: value => store.getProperty(value),
          compareAndUpdate: (baseline, replacement) => store.compareAndUpdate(baseline, replacement),
        });
        if (retry.status !== 'complete') {
          setError(retry.status === 'conflict' ? t('edit.recovery_conflict') : t('edit.save_failed'));
          return;
        }
        setProperty(pending.candidate);
        setDraft(null);
      draftRef.current = null;
        setMode('detail');
        return;
      }
      await flushPropertyEditDraftWrites();
      const persistedDraft = await loadPropertyEditDraft(draft.propertyCoreId);
      if (!persistedDraft || JSON.stringify(persistedDraft) !== JSON.stringify(draft)) {
        setError(t('edit.draft_conflict'));
        return;
      }
      const candidate = buildPropertyUpdateCandidate(draft.baseline, draft.choices);
      const operation = createPropertyUpdateOperation({
        operationId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        baseline: draft.baseline,
        candidate,
        draftSnapshot: draft,
        preparedAt: new Date().toISOString(),
      });
      await persistPropertyUpdateOperation(operation);
      const result = await executePropertyUpdateRecovery({
        operation,
        allowUpdate: true,
        getProperty: value => store.getProperty(value),
        compareAndUpdate: (baseline, replacement) => store.compareAndUpdate(baseline, replacement),
      });
      if (result.status !== 'complete') {
        setError(result.status === 'conflict' ? t('edit.recovery_conflict') : t('edit.save_failed'));
        return;
      }
      setProperty(candidate);
      setDraft(null);
      draftRef.current = null;
      setMode('detail');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(
        caught instanceof PendingPropertyUpdateExistsError ? t('edit.recovery_pending')
          : message.includes('INCOMPATIBLE_TYPE_DETAILS') ? t('edit.type_incompatible')
          : message.includes('INVALID_APPROVED_AREA') ? t('edit.area_invalid')
            : message.includes('MISSING_RENTAL_PERIOD') ? t('edit.rental_period_missing')
              : message.includes('INVALID_PRICE') ? t('errors.invalid_price')
                : t('edit.save_failed'),
      );
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!property || deleting) return;
    if (!store.canPermanentlyDelete()) {
      setDeleteVisible(false);
      setError(t('delete.failed'));
      return;
    }
    setDeleting(true);
    setError('');
    const expected = property;
    try {
      const result = await deleteSavedProperty({ expected, store });
      if (result.status !== 'deleted') {
        setDeleteVisible(false);
        setError(t('delete.failed'));
        return;
      }
      setDeleteVisible(false);
      router.replace('/' as never);
    } catch {
      setDeleteVisible(false);
      setError(t('delete.failed'));
    } finally {
      setDeleting(false);
    }
  };

  if (status !== 'ready' || !property) {
    const message = status === 'loading'
      ? t('edit.loading')
      : status === 'missing' ? t('edit.not_found') : t('edit.unreadable');
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium, textAlign: 'center' }}>{message}</Text>
        <Button
          title={t('capture.back')}
          onPress={() => router.replace('/' as never)}
          variant="outline"
          testID="property-detail-back"
        />
      </View>
    );
  }

  const choices = draft?.choices;
  const shownTransaction = mode === 'edit' && choices ? choices.transaction : property.activeOffer.transaction;
  const shownPrice = mode === 'edit' && choices
    ? choices.priceAmount
    : property.activeOffer.transaction === 'sale'
      ? property.activeOffer.salePrice.amount
      : property.activeOffer.rentalPrice.amount;
  const shownRentalPeriodId = mode === 'edit' && choices
    ? choices.rentalPeriodId
    : property.activeOffer.transaction === 'rent'
      ? property.activeOffer.rentalPeriodId
      : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity
          onPress={mode === 'edit' ? leaveEditor : () => router.back()}
          accessibilityRole="button"
          testID="property-detail-back"
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('capture.back')}</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: fonts.bold }]}>
          {mode === 'edit' ? t('edit.title') : t('detail.title')}
        </Text>
        {mode === 'detail' ? (
          <View style={styles.headerActions}>
            {canPermanentlyDelete ? (
              <TouchableOpacity onPress={() => setDeleteVisible(true)} accessibilityRole="button" testID="property-delete-action">
                <Text style={{ color: colors.destructive, fontFamily: fonts.semiBold }}>{t('detail.delete')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={beginEdit} accessibilityRole="button" testID="property-edit-action">
              <Text style={{ color: colors.primary, fontFamily: fonts.semiBold }}>{t('detail.edit')}</Text>
            </TouchableOpacity>
          </View>
        ) : <View style={styles.headerSpacer} />}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <Text testID="property-edit-error" style={[styles.error, { color: colors.destructive, fontFamily: fonts.medium }]}>{error}</Text> : null}
        {pendingOperation && (recoveryStatus === 'retry_required' || recoveryStatus === 'update_failed') ? (
          <Button
            title={t('edit.retry_update')}
            onPress={() => void retryRecovery(true)}
            loading={saving}
            testID="property-update-retry"
          />
        ) : null}
        {pendingOperation && recoveryStatus === 'cleanup_failed' ? (
          <Button
            title={t('edit.retry_cleanup')}
            onPress={() => void retryRecovery(false)}
            loading={saving}
            testID="property-update-cleanup-retry"
          />
        ) : null}
        {mode === 'detail' ? (
          <>
            <DetailRow label={t('detail.type')} value={t(`propertyType.${property.core.propertyType}` as keyof Translations)} />
            <DetailRow label={t('detail.transaction')} value={t(`transaction.${property.activeOffer.transaction}` as keyof Translations)} />
            <DetailRow
              label={t('detail.price')}
              value={property.activeOffer.transaction === 'rent'
                ? formatRentalPrice(shownPrice!, 'KWD', shownRentalPeriodId, language, t)
                : formatPrice(shownPrice!, 'KWD', language)}
            />
            <DetailRow label={t('detail.area')} value={areaName(property.core.locationArea.id)} />
          </>
        ) : choices ? (
          <>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('detail.type')}</Text>
            <View style={styles.options}>
              {PROPERTY_TYPES.map(type => (
                <Choice key={type} selected={choices.propertyType === type} onPress={() => updateChoices({ propertyType: type })} title={t(`propertyType.${type}` as keyof Translations)} testID={`edit-type-${type}`} />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('detail.transaction')}</Text>
            <View style={styles.horizontal}>
              {(['sale', 'rent'] as Transaction[]).map(transaction => (
                <Choice key={transaction} selected={shownTransaction === transaction} onPress={() => selectTransaction(transaction)} title={t(`transaction.${transaction}` as keyof Translations)} testID={`edit-transaction-${transaction}`} />
              ))}
            </View>
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
              {shownTransaction === 'rent'
                ? `${t('price.amount')} · ${formatRentalCadence(shownRentalPeriodId, t)}`
                : t('price.amount')}
            </Text>
            <TextInput
              value={shownPrice === undefined ? '' : String(shownPrice)}
              onChangeText={value => updateChoices({ priceAmount: value.trim() === '' ? undefined : Number(value) })}
              keyboardType="decimal-pad"
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
              testID="edit-price"
            />
            <Text style={[styles.label, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('detail.area')}</Text>
            <TouchableOpacity
              onPress={() => setAreaOpen(true)}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card }]}
              accessibilityRole="button"
              testID="edit-area-selector"
            >
              <Text style={{ color: colors.foreground, fontFamily: fonts.regular }}>{areaName(choices.locationAreaId)}</Text>
            </TouchableOpacity>
            <Button title={t('edit.save')} onPress={save} loading={saving} testID="property-edit-save" />
          </>
        ) : null}
      </ScrollView>

      <Modal visible={areaOpen} animationType="slide" onRequestClose={() => setAreaOpen(false)}>
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + (Platform.OS === 'web' ? 67 : 0) }]}>
          <TextInput
            value={areaSearch}
            onChangeText={setAreaSearch}
            placeholder={t('location.search')}
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, styles.areaSearch, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, textAlign: isRTL ? 'right' : 'left' }]}
            testID="edit-area-search"
          />
          <ScrollView contentContainerStyle={styles.content}>
            {searchAreas(areaSearch).map(area => (
              <TouchableOpacity
                key={area.id}
                onPress={() => {
                  updateChoices({ locationAreaId: area.id });
                  setAreaOpen(false);
                  setAreaSearch('');
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: choices?.locationAreaId === area.id }}
                testID={`edit-area-${area.id}`}
                style={[styles.areaRow, { borderBottomColor: colors.border }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{language === 'ar' ? area.ar : area.en}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Button title={t('capture.cancel')} onPress={() => setAreaOpen(false)} variant="outline" />
        </View>
      </Modal>

      <Modal
        visible={deleteVisible && canPermanentlyDelete}
        transparent
        animationType="fade"
        onRequestClose={() => !deleting && setDeleteVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]} testID="property-delete-dialog" accessibilityRole="alert">
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('delete.title')}
            </Text>
            <Text style={[styles.modalMessage, { color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('delete.message').replace('{identity}', `${t(`propertyType.${property.core.propertyType}` as keyof Translations)} · ${areaName(property.core.locationArea.id)} · ${property.core.id}`)}
            </Text>
            <TouchableOpacity onPress={() => setDeleteVisible(false)} disabled={deleting} style={[styles.modalAction, { borderColor: colors.border }]} testID="property-delete-cancel">
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>{t('capture.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void confirmDelete()} disabled={deleting} style={[styles.modalAction, { borderColor: colors.destructive, opacity: deleting ? 0.6 : 1 }]} testID="property-delete-confirm">
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>{t('delete.confirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={leaveVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderRadius: colors.cardRadius,
              },
            ]}
            testID="property-edit-leave-dialog"
            accessibilityRole="alert"
          >
            <Text
              style={[
                styles.modalTitle,
                {
                  color: colors.foreground,
                  fontFamily: fonts.bold,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('edit.leave_title')}
            </Text>
            <Text
              style={[
                styles.modalMessage,
                {
                  color: colors.mutedForeground,
                  fontFamily: fonts.regular,
                  textAlign: isRTL ? 'right' : 'left',
                },
              ]}
            >
              {t('edit.leave_message')}
            </Text>
            <TouchableOpacity
              onPress={() => setLeaveVisible(false)}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="property-edit-keep-editing"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                {t('capture.keep_editing')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setLeaveVisible(false);
                setMode('detail');
              }}
              style={[styles.modalAction, { borderColor: colors.border }]}
              testID="property-edit-keep-draft-exit"
              accessibilityRole="button"
            >
              <Text style={[styles.modalActionText, { color: colors.primary, fontFamily: fonts.semiBold }]}>
                {t('edit.keep_exit')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => void discardEditDraft()}
              disabled={discarding}
              style={[styles.modalAction, { borderColor: colors.border, opacity: discarding ? 0.6 : 1 }]}
              testID="property-edit-discard"
              accessibilityRole="button"
              accessibilityState={{ disabled: discarding, busy: discarding }}
            >
              <Text style={[styles.modalActionText, { color: colors.destructive, fontFamily: fonts.semiBold }]}>
                {t('edit.discard')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <View style={[styles.detailRow, { borderBottomColor: colors.border }]}>
        <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{label}</Text>
        <Text style={[styles.detailValue, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{value}</Text>
      </View>
    );
  }

  function Choice({ selected, onPress, title, testID }: { selected: boolean; onPress: () => void; title: string; testID: string }) {
    return (
      <TouchableOpacity
        onPress={onPress}
        testID={testID}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={[styles.choice, { borderColor: selected ? colors.primary : colors.border, backgroundColor: colors.card }]}
      >
        <Text style={{ color: colors.foreground, fontFamily: fonts.medium }}>{title}</Text>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, padding: 24, justifyContent: 'center', gap: 24 },
  header: { minHeight: 60, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20 },
  headerSpacer: { width: 40 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  content: { padding: 20, paddingBottom: 48, gap: 16 },
  detailRow: { paddingVertical: 18, borderBottomWidth: 1 },
  detailValue: { fontSize: 18, marginTop: 6 },
  label: { fontSize: 16, marginTop: 8 },
  options: { gap: 8 },
  horizontal: { flexDirection: 'row', gap: 8 },
  choice: { minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  input: { minHeight: 54, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, justifyContent: 'center' },
  error: { padding: 12 },
  areaSearch: { marginHorizontal: 20, marginTop: 16 },
  areaRow: { minHeight: 52, justifyContent: 'center', borderBottomWidth: 1 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 29, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  modalTitle: { fontSize: 20 },
  modalMessage: { fontSize: 15, lineHeight: 22, marginBottom: 4 },
  modalAction: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  modalActionText: { fontSize: 15, textAlign: 'center' },
});