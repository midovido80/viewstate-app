import { Text } from "@/components/AppText";
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useI18n } from '@/contexts/I18nContext';
import { nextDesign as n } from '@/constants/nextDesign';
import { Button } from '@/components/Button';

export function TrustCircleHero() {
  const { language, isRTL, fonts } = useI18n(),
    router = useRouter();
  const ar = language === 'ar';
  const label = {
    color: n.white,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ('right' as const) : ('left' as const),
    lineHeight: 24,
  };
  return (
    <View
      testID="next-home-trust-circle"
      style={{
        backgroundColor: n.navy,
        borderRadius: 20,
        padding: 20,
        gap: 14,
      }}
    >
      <View
        style={{
          direction: 'ltr',
          flexDirection: isRTL ? 'row-reverse' : 'row',
          gap: 12,
          alignItems: 'center',
        }}
      >
        <Feather name="users" size={34} color={n.white} />
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            style={{
              ...label,
              fontFamily: fonts.bold,
              fontSize: 26,
              lineHeight: 34,
            }}
          >
            {ar ? 'دائرة الثقة' : 'Trust Circle'}
          </Text>
          <Text style={{ ...label, fontFamily: fonts.medium }}>
            {ar
              ? 'عقارك عندك، وفرصته عند زملائك'
              : 'Your listing. More opportunities with your colleagues.'}
          </Text>
        </View>
      </View>
      <Text style={label}>
        {ar
          ? 'شارك عقاراتك مع زملائك، وخل المطابقة تربطها بطلبات العملاء. كل طرف يقدر يتابع الفرصة ويتواصل مع زميله.'
          : 'Share listings with trusted colleagues and match them with client requests. Both brokers can follow up and connect.'}
      </Text>
      <View
        style={{
          direction: 'ltr',
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Feather name="home" size={19} color="#A9CDFF" />
        <Text style={{ ...label, flex: 1, fontSize: 13 }}>
          {ar
            ? 'عقار مشارك + طلب مناسب = فرصة تعاون'
            : 'Shared property + suitable request = cooperation'}
        </Text>
      </View>
      <Button
        title={ar ? 'افتح دائرة الثقة' : 'Open Trust Circle'}
        onPress={() => router.push('/circle' as never)}
        testID="home-open-circle"
      />
      <Text style={{ ...label, fontSize: 12, color: '#D7E5FA' }}>
        {ar
          ? 'مواصفات العقار للمطابقة، وبيانات العميل والمالك تبقى خاصة.'
          : 'Share matching specifications; client and owner details stay private.'}
      </Text>
    </View>
  );
}
