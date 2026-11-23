import { Feather } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { nextDesign as colors } from '@/constants/nextDesign';
import { useI18n } from '@/contexts/I18nContext';
import type { HomeQuickAction } from '@/services/assistantHome';

type Copy = readonly [title: string, detail: string];
const tasks: readonly {
  action: HomeQuickAction;
  icon: ComponentProps<typeof Feather>['name'];
  en: Copy;
  ar: Copy;
}[] = [
  { action: 'property', icon: 'home', en: ['Add a property', 'Save a listing for sale or rent'], ar: ['إضافة عقار', 'احفظ عقارًا للبيع أو للإيجار'] },
  { action: 'person', icon: 'user-plus', en: ['Add a person', 'Save a client, owner or contact'], ar: ['إضافة شخص', 'احفظ بيانات عميل أو مالك'] },
  { action: 'appointment', icon: 'calendar', en: ['Book an appointment', 'Schedule a viewing or follow-up'], ar: ['حجز موعد', 'حدّد موعد معاينة أو متابعة'] },
  { action: 'matching', icon: 'repeat', en: ['Find matches', 'Compare properties with client requests'], ar: ['مطابقة العقارات', 'قارن العقارات بطلبات العملاء'] },
  { action: 'import', icon: 'download', en: ['Import', 'Bring in a message, file or contact'], ar: ['استيراد', 'أضف رسالة أو ملفًا أو جهة اتصال'] },
  { action: 'share', icon: 'share-2', en: ['Share a property', 'Choose a saved listing to share'], ar: ['مشاركة عقار', 'اختر عقارًا محفوظًا لمشاركته'] },
];

export function HomeTaskActions({ onAction, menu = false }: {
  onAction: (action: HomeQuickAction) => void;
  menu?: boolean;
}) {
  const { isRTL, language, fonts } = useI18n();
  const alignment = isRTL ? 'right' : 'left';
  const visibleTasks = menu ? tasks : tasks.filter(task => task.action !== 'share');

  return (
    <View style={styles.list}>
      {visibleTasks.map(({ action, icon, en, ar }, index) => {
        const [title, detail] = language === 'ar' ? ar : en;
        return (
          <Pressable
            key={action}
            {...(Platform.OS === 'web' ? { dir: 'ltr' as const } : {})}
            testID={menu ? `home-quick-${action}` : `home-start-${action}`}
            accessibilityRole="button"
            accessibilityLabel={title}
            accessibilityHint={detail}
            onPress={() => onAction(action)}
            android_ripple={{ color: colors.soft }}
            style={({ pressed }) => [
              styles.row,
              { flexDirection: isRTL ? 'row-reverse' : 'row' },
              index > 0 && styles.divider,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.icon} importantForAccessibility="no-hide-descendants">
              <Feather name={icon} size={19} color={colors.blue} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { fontFamily: fonts.bold, textAlign: alignment, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{title}</Text>
              <Text style={[styles.detail, { fontFamily: fonts.regular, textAlign: alignment, writingDirection: isRTL ? 'rtl' : 'ltr' }]}>{detail}</Text>
            </View>
            <View importantForAccessibility="no-hide-descendants">
              <Feather name={isRTL ? 'chevron-left' : 'chevron-right'} size={19} color={colors.muted} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 16, overflow: 'hidden' },
  row: { direction: 'ltr', minHeight: 58, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  pressed: { backgroundColor: colors.soft },
  icon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.soft, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1 },
  title: { fontSize: 15, color: colors.ink },
  detail: { fontSize: 13, color: colors.muted },
});
