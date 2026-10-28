import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { PrimaryTabHeader } from '@/components/PrimaryTabHeader';

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const { t, isRTL, fonts } = useI18n();
  const insets = useScreenInsets();

  const handleImport = () => {
    Alert.alert(t('common.comingLater'), t('home.importComingLater'));
  };

  const actions = [
    {
      id: 'addProperty',
      title: t('home.action.addProperty'),
      icon: 'home',
       onPress: () => router.push('/capture/transaction' as never),
      color: colors.primary,
    },
    {
      id: 'addPerson',
      title: t('home.action.addPerson'),
      icon: 'user-plus',
      onPress: () => router.push('/person/new' as never),
      color: colors.success,
    },
    {
      id: 'matches',
      title: t('home.action.matches'),
      icon: 'target',
      onPress: () => router.push('/matching' as never),
      color: colors.primary,
    },
    {
      id: 'import',
      title: t('home.action.import'),
      icon: 'download',
      onPress: handleImport,
      color: colors.mutedForeground,
    }
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <PrimaryTabHeader title={t('home.title')} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <View style={[styles.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {actions.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={action.onPress}
            >
              <View style={[styles.iconContainer, { backgroundColor: action.color + '1A' }]}>
                <Feather name={action.icon as any} size={32} color={action.color} />
              </View>
              <Text style={[styles.cardTitle, { color: colors.foreground, fontFamily: fonts.semiBold }]}>
                {action.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingTop: 32,
  },
  grid: {
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  card: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    textAlign: 'center',
  },
});
