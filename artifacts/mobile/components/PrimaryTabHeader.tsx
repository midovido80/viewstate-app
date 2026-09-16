import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/contexts/I18nContext';

interface PrimaryTabHeaderProps {
  title: string;
}

export function PrimaryTabHeader({ title }: PrimaryTabHeaderProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, isRTL, fonts } = useI18n();

  const handleSearch = () => {
    Alert.alert(t('common.comingLater'), t('common.searchComingLater'));
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.primary, paddingTop: insets.top }]}>
      <View style={[styles.content, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text style={[styles.title, { color: colors.primaryForeground, fontFamily: fonts.bold }]}>
          {title}
        </Text>
      </View>
      <View style={[styles.searchContainer, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity 
          style={[styles.searchBar, { backgroundColor: 'rgba(255, 255, 255, 0.2)', flexDirection: isRTL ? 'row-reverse' : 'row' }]} 
          onPress={handleSearch}
          activeOpacity={0.7}
        >
          <Feather name="search" size={18} color={colors.primaryForeground} />
          <Text style={[styles.searchText, { color: colors.primaryForeground, fontFamily: fonts.medium, textAlign: isRTL ? 'right' : 'left' }]}>
            {t('common.search')}
          </Text>
          <Text style={[styles.comingLater, { color: colors.primaryForeground, fontFamily: fonts.regular }]}>
            {t('common.comingLater')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
  },
  searchContainer: {
    paddingHorizontal: 20,
  },
  searchBar: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchText: {
    fontSize: 16,
    flex: 1,
  },
  comingLater: {
    fontSize: 12,
    opacity: 0.8,
  }
});
