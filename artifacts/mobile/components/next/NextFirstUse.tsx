import { Text, View } from 'react-native';
import { HomeTaskActions } from '@/components/assistant/home-task-actions';
import { nextDesign as colors } from '@/constants/nextDesign';
import { useI18n } from '@/contexts/I18nContext';
import type { HomeQuickAction } from '@/services/assistantHome';

export function NextFirstUse({ onAction }: { onAction: (action: HomeQuickAction) => void }) {
  const { language, isRTL, fonts } = useI18n();
  const ar = language === 'ar';
  const textAlign = isRTL ? 'right' : 'left';

  return (
    <View testID="next-first-use" style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: colors.ink, fontFamily: fonts.bold, fontSize: 26, textAlign }}>
        {ar ? 'ماذا تريد أن تفعل؟' : 'What would you like to do?'}
      </Text>
      <HomeTaskActions onAction={onAction} />
    </View>
  );
}
