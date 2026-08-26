import { useState, useMemo } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, Modal, SectionList, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useCapture } from '@/contexts/CaptureContext';
import { useI18n } from '@/contexts/I18nContext';
import { useColors } from '@/hooks/useColors';
import { CaptureHeader } from '@/components/CaptureHeader';
import { Button } from '@/components/Button';
import { KUWAIT_AREAS, Area, getAreaById, searchAreas } from '@/constants/kuwait-areas';

export default function LocationScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft } = useCapture();
  const { t, isRTL, language, fonts } = useI18n();

  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState('');

  const areaId = draft.locationAreaId ?? '';
  const isValid = areaId.trim().length > 0;

  const selectedArea = getAreaById(areaId);
  const displayValue = selectedArea
    ? (language === 'ar' ? selectedArea.ar : selectedArea.en)
    : areaId;

  const handleNext = () => {
    if (!isValid) return;
    router.push('/capture/summary' as any);
  };

  const sections = useMemo(() => {
    const filtered = searchAreas(search);

    const groups = new Map<string, { title: string; order: number; data: Area[] }>();
    filtered.forEach(a => {
      const title = language === 'ar' ? a.governorateAr : a.governorateEn;
      if (!groups.has(a.governorateId)) {
        const firstAreaIndex = KUWAIT_AREAS.findIndex(
          area => area.governorateId === a.governorateId,
        );
        groups.set(a.governorateId, { title, order: firstAreaIndex, data: [] });
      }
      groups.get(a.governorateId)!.data.push(a);
    });

    return Array.from(groups.values()).sort((a, b) => a.order - b.order);
  }, [search, language]);

  const handleSelect = (id: string) => {
    updateDraft({ locationAreaId: id });
    setModalVisible(false);
    setSearch('');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <CaptureHeader step={4} totalSteps={4} />
      
      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
          {t('location.title')}
        </Text>

        <Text style={[styles.label, { color: colors.mutedForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>{t('location.areaId')}</Text>

        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={[styles.selectorBtn, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.inputRadius }]}
        >
          <Text style={[
            styles.selectorText,
            { 
              color: isValid ? colors.foreground : colors.mutedForeground,
              fontFamily: isValid ? fonts.semiBold : fonts.regular,
              textAlign: isRTL ? 'right' : 'left'
            }
          ]}>
            {isValid ? displayValue : t('location.areaId')}
          </Text>
          <Feather name="chevron-down" size={20} color={colors.mutedForeground} />
        </TouchableOpacity>
        {KUWAIT_AREAS.length === 0 && (
          <Text style={[styles.datasetNotice, {
            color: colors.mutedForeground,
            fontFamily: fonts.regular,
            textAlign: isRTL ? 'right' : 'left',
          }]}>
            {t('location.datasetUnavailable')}
          </Text>
        )}
      </View>
      
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Button 
          title={t('capture.next')} 
          onPress={handleNext} 
          disabled={!isValid}
          size="large"
          testID="btn-next"
        />
      </View>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setModalVisible(false)}>
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { paddingTop: insets.top || 16, backgroundColor: colors.card, borderBottomColor: colors.border, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>{t('location.pickerTitle')}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('capture.cancel')}
              onPress={() => setModalVisible(false)}
              style={styles.closeBtn}
            >
              <Feather name="x" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={[styles.searchContainer, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={[styles.searchInputWrapper, { backgroundColor: colors.background, borderColor: colors.turquoise, borderRadius: colors.inputRadius, flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
              <Feather name="search" size={20} color={colors.primary} style={styles.searchIcon} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('location.search')}
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
                style={[styles.searchInput, { color: colors.foreground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }]}
              />
            </View>
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <SectionList
              sections={sections}
              keyExtractor={item => item.id}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: Math.max(insets.bottom + 48, 80) },
              ]}
              automaticallyAdjustKeyboardInsets
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              stickySectionHeadersEnabled
              renderSectionHeader={({ section: { title } }) => (
                <Text style={[styles.sectionHeader, { color: colors.foreground, fontFamily: fonts.bold, backgroundColor: colors.secondary, textAlign: isRTL ? 'right' : 'left' }]}>
                  {title}
                </Text>
              )}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.areaItem,
                    {
                      backgroundColor: areaId === item.id ? colors.secondary : colors.card,
                      borderBottomColor: colors.border,
                      flexDirection: isRTL ? 'row-reverse' : 'row',
                    },
                  ]}
                  onPress={() => handleSelect(item.id)}
                >
                  <Text style={[styles.areaText, { color: colors.foreground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
                    {language === 'ar' ? item.ar : item.en}
                  </Text>
                  {areaId === item.id && (
                    <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                      <Feather name="check" size={16} color={colors.primaryForeground} />
                    </View>
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                   <Feather name="map-pin" size={28} color={colors.mutedForeground} />
                   <Text style={[styles.emptyText, {
                     color: colors.mutedForeground,
                     fontFamily: fonts.medium,
                     textAlign: 'center',
                   }]}>
                     {t('location.empty')}
                   </Text>
                </View>
              }
            />
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  title: {
    fontSize: 28,
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
  },
  selectorBtn: {
    height: 56,
    borderWidth: 1,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectorText: {
    fontSize: 16,
    flex: 1,
  },
  datasetNotice: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    minHeight: 68,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 24,
    flex: 1,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  searchInputWrapper: {
    minHeight: 52,
    alignItems: 'center',
    borderWidth: 1,
  },
  searchIcon: {
    marginHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    fontSize: 16,
    paddingRight: 12,
  },
  listContent: {
    paddingBottom: 80,
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
  },
  areaItem: {
    paddingHorizontal: 20,
    minHeight: 56,
    paddingVertical: 14,
    borderBottomWidth: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  areaText: {
    fontSize: 16,
    lineHeight: 24,
    flex: 1,
    flexWrap: 'wrap',
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
  }
});
