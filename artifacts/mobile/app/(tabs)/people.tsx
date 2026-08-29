import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { useColors } from '@/hooks/useColors';
import { useI18n, Translations } from '@/contexts/I18nContext';
import { Person } from '@/services/people';
import { store } from '@/services/persistence';

export default function PeopleScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();
  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    const load = search.trim() ? store.searchPeople(search) : store.getPeople();
    void load.then(items => active && setPeople(items)).catch(() => {
      if (active) setError(t('people.load_failed'));
    });
    return () => { active = false; };
  }, [search, t]));

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.title, { color: colors.foreground, fontFamily: fonts.bold, textAlign: isRTL ? 'right' : 'left' }]}>
        {t('people.title')}
      </Text>
      <View style={styles.searchWrap}>
        <Feather name="search" size={20} color={colors.mutedForeground} style={[styles.icon, isRTL ? { right: 34 } : { left: 34 }]} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('people.search')}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.search, {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: colors.border,
            textAlign: isRTL ? 'right' : 'left',
            fontFamily: fonts.regular,
          }]}
          testID="people-search"
          accessibilityLabel={t('people.search')}
        />
      </View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]} testID="people-error">{error}</Text> : null}
      <FlatList
        data={people}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground, fontFamily: fonts.medium }]}>{t('people.empty')}</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/person/${encodeURIComponent(item.id)}` as never)}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderRadius: colors.cardRadius }]}
            testID={`person-card-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.displayPhone}`}
          >
            <Text style={[styles.name, { color: colors.foreground, fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }]}>{item.name}</Text>
            <Text style={{ color: colors.mutedForeground, fontFamily: fonts.regular, textAlign: isRTL ? 'right' : 'left' }}>{item.displayPhone}</Text>
            <Text style={[styles.classes, { color: colors.primary, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
              {item.classifications.map(value => t(`people.classification.${value}` as keyof Translations)).join(' · ')}
            </Text>
          </TouchableOpacity>
        )}
      />
      <View style={[styles.add, { bottom: insets.bottom + 76 }]}>
        <Button title={t('people.add')} onPress={() => router.push('/person/new' as never)} testID="people-add" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, paddingHorizontal: 20, paddingTop: 16 },
  searchWrap: { paddingHorizontal: 20, paddingVertical: 14, justifyContent: 'center' },
  icon: { position: 'absolute', zIndex: 1 },
  search: { minHeight: 54, borderWidth: 1, borderRadius: 10, paddingHorizontal: 44, fontSize: 16 },
  list: { padding: 20, paddingBottom: 150 },
  card: { padding: 16, borderWidth: 1, marginBottom: 12, gap: 5 },
  name: { fontSize: 18 },
  classes: { marginTop: 4, fontSize: 13 },
  empty: { textAlign: 'center', paddingTop: 60 },
  error: { paddingHorizontal: 20 },
  add: { position: 'absolute', left: 20, right: 20 },
});