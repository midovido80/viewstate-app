import { Feather } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useI18n } from '@/contexts/I18nContext';

type FeatherIconName = keyof typeof Feather.glyphMap;

interface HomeSectionHeadingProps {
  title: string;
  actionLabel?: string;
  onActionPress?: () => void;
  testID?: string;
}

export function HomeSectionHeading({
  title,
  actionLabel,
  onActionPress,
  testID,
}: HomeSectionHeadingProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const showAction = Boolean(actionLabel && onActionPress);

  return (
    <View
      style={[styles.sectionHeading, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}
      testID={testID}
    >
      <Text
        style={[
          styles.sectionTitle,
          {
            color: colors.vapp47.textPrimary,
            fontFamily: fonts.bold,
            textAlign: isRTL ? 'right' : 'left',
          },
        ]}
      >
        {title}
      </Text>
      {showAction ? (
        <Pressable
          accessibilityLabel={actionLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onActionPress}
          style={({ pressed }) => [styles.headingAction, pressed && styles.pressed]}
        >
          <Text
            style={{
              color: colors.vapp47.brandPrimary,
              fontFamily: fonts.semiBold,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface HomeQuickActionProps {
  title: string;
  caption?: string;
  icon: FeatherIconName;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
}

export function HomeQuickAction({
  title,
  caption,
  icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  testID,
}: HomeQuickActionProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.actionCard,
        colors.vapp47.homeShadow,
        {
          backgroundColor: disabled
            ? colors.vapp47.disabledSurface
            : colors.vapp47.cardSurface,
          borderColor: colors.vapp47.visualBorder,
          borderRadius: colors.vapp47.homeCardRadius,
          opacity: disabled ? 0.64 : pressed ? 0.84 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.actionIcon,
          { backgroundColor: disabled ? colors.vapp47.visualBorder : colors.vapp47.brandSoft },
        ]}
      >
        <Feather
          color={disabled ? colors.vapp47.textMuted : colors.vapp47.brandPrimary}
          name={icon}
          size={22}
        />
      </View>
      <Text
        style={[
          styles.actionTitle,
          {
            color: disabled ? colors.vapp47.textMuted : colors.vapp47.textPrimary,
            fontFamily: fonts.semiBold,
            textAlign: isRTL ? 'right' : 'left',
          },
        ]}
      >
        {title}
      </Text>
      {caption ? (
        <Text
          style={[
            styles.actionCaption,
            {
              color: colors.vapp47.textMuted,
              fontFamily: fonts.regular,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

type HomeSummaryState =
  | { state: 'ready'; value: string | number }
  | { state: 'loading'; stateLabel: string }
  | { state: 'unavailable'; stateLabel: string };

interface HomeSummaryCardProps {
  label: string;
  icon: FeatherIconName;
  tone?: 'brand' | 'data' | 'communication';
  status: HomeSummaryState;
  testID?: string;
}

export function HomeSummaryCard({
  label,
  icon,
  tone = 'brand',
  status,
  testID,
}: HomeSummaryCardProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const toneColor = {
    brand: colors.vapp47.brandPrimary,
    data: colors.vapp47.dataEmphasis,
    communication: colors.vapp47.communication,
  }[tone];

  return (
    <View
      accessibilityLabel={label}
      accessibilityState={{ busy: status.state === 'loading' }}
      style={[
        styles.summaryCard,
        {
          backgroundColor: colors.vapp47.cardSurface,
          borderColor: colors.vapp47.visualBorder,
          borderRadius: colors.vapp47.homeCardRadius,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.summaryHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Feather color={toneColor} name={icon} size={19} />
        <Text
          style={[
            styles.summaryLabel,
            {
              color: colors.vapp47.textMuted,
              fontFamily: fonts.medium,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {label}
        </Text>
      </View>
      {status.state === 'ready' ? (
        <Text
          style={[
            styles.summaryValue,
            {
              color: colors.vapp47.textPrimary,
              fontFamily: fonts.bold,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {status.value}
        </Text>
      ) : (
        <View style={[styles.summaryStatus, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
          {status.state === 'loading' ? (
            <ActivityIndicator color={toneColor} size="small" />
          ) : (
            <Feather color={colors.vapp47.warning} name="alert-circle" size={16} />
          )}
          <Text
            style={{
              color: colors.vapp47.textMuted,
              fontFamily: fonts.regular,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {status.stateLabel}
          </Text>
        </View>
      )}
    </View>
  );
}

interface HomeFutureCardProps {
  title: string;
  caption: string;
  icon: FeatherIconName;
  accessibilityLabel: string;
  testID?: string;
}

export function HomeFutureCard({
  title,
  caption,
  icon,
  accessibilityLabel,
  testID,
}: HomeFutureCardProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={[
        styles.futureCard,
        {
          backgroundColor: colors.vapp47.disabledSurface,
          borderColor: colors.vapp47.visualBorder,
          borderRadius: colors.vapp47.homeCardRadius,
          flexDirection: isRTL ? 'row-reverse' : 'row',
        },
      ]}
      testID={testID}
    >
      <View style={[styles.futureIcon, { backgroundColor: colors.vapp47.cardSurface }]}>
        <Feather color={colors.vapp47.textMuted} name={icon} size={22} />
      </View>
      <View style={styles.futureCopy}>
        <Text
          style={[
            styles.futureTitle,
            {
              color: colors.vapp47.textMuted,
              fontFamily: fonts.semiBold,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {title}
        </Text>
        <Text
          style={[
            styles.futureCaption,
            {
              color: colors.vapp47.textMuted,
              fontFamily: fonts.regular,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {caption}
        </Text>
      </View>
    </View>
  );
}

interface HomePropertyCardProps {
  propertyId: string;
  title: string;
  price?: string;
  location?: string;
  badge?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export function HomePropertyCard({
  propertyId,
  title,
  price,
  location,
  badge,
  onPress,
  accessibilityLabel,
  testID,
}: HomePropertyCardProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();
  const cardStyle: ViewStyle[] = [
    styles.propertyCard,
    colors.vapp47.homeShadow,
    {
      backgroundColor: colors.vapp47.cardSurface,
      borderColor: colors.vapp47.visualBorder,
      borderRadius: colors.vapp47.homeCardRadius,
    },
  ];
  const content = (
    <>
      <View style={[styles.propertyHeader, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
        <Text
          style={[
            styles.propertyTitle,
            {
              color: colors.vapp47.textPrimary,
              fontFamily: fonts.semiBold,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {title}
        </Text>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: colors.vapp47.brandSoft }]}>
            <Text style={{ color: colors.vapp47.brandPrimary, fontFamily: fonts.medium }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {price ? (
        <Text
          style={[
            styles.propertyPrice,
            {
              color: colors.vapp47.dataEmphasis,
              fontFamily: fonts.bold,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {price}
        </Text>
      ) : null}
      {location ? (
        <Text
          style={{
            color: colors.vapp47.textMuted,
            fontFamily: fonts.regular,
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          {location}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={cardStyle} testID={testID ?? `home-property-${propertyId}`}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
      testID={testID ?? `home-property-${propertyId}`}
    >
      {content}
    </Pressable>
  );
}

interface HomeEmptyStateProps {
  title: string;
  caption?: string;
  icon: FeatherIconName;
  testID?: string;
}

export function HomeEmptyState({ title, caption, icon, testID }: HomeEmptyStateProps) {
  const colors = useColors();
  const { fonts, isRTL } = useI18n();

  return (
    <View style={styles.emptyState} testID={testID}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.vapp47.brandSoft }]}>
        <Feather color={colors.vapp47.brandPrimary} name={icon} size={26} />
      </View>
      <Text
        style={[
          styles.emptyTitle,
          {
            color: colors.vapp47.textPrimary,
            fontFamily: fonts.semiBold,
            textAlign: isRTL ? 'right' : 'left',
          },
        ]}
      >
        {title}
      </Text>
      {caption ? (
        <Text
          style={[
            styles.emptyCaption,
            {
              color: colors.vapp47.textMuted,
              fontFamily: fonts.regular,
              textAlign: isRTL ? 'right' : 'left',
            },
          ]}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  sectionTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 28,
  },
  headingAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.78,
  },
  actionCard: {
    minHeight: 132,
    borderWidth: 1,
    padding: 16,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  actionTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  actionCaption: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  summaryCard: {
    minHeight: 116,
    borderWidth: 1,
    padding: 16,
  },
  summaryHeader: {
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  summaryValue: {
    fontSize: 28,
    lineHeight: 36,
    marginTop: 12,
  },
  summaryStatus: {
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  futureCard: {
    minHeight: 88,
    alignItems: 'center',
    borderWidth: 1,
    gap: 14,
    padding: 16,
    opacity: 0.72,
  },
  futureIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
  },
  futureCopy: {
    flex: 1,
  },
  futureTitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  futureCaption: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3,
  },
  propertyCard: {
    borderWidth: 1,
    padding: 16,
  },
  propertyHeader: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
  },
  propertyTitle: {
    flex: 1,
    fontSize: 16,
    lineHeight: 23,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  propertyPrice: {
    fontSize: 22,
    lineHeight: 30,
    marginTop: 14,
    marginBottom: 3,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 24,
  },
  emptyCaption: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
});