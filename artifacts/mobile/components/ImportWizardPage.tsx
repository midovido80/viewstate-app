import { Text } from "@/components/AppText";
import React, { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { nextDesign as n } from '@/constants/nextDesign';

export function ImportWizardPage({
  title,
  subtitle,
  back,
  footer,
  pageKey,
  children,
}: {
  title: string;
  subtitle?: string;
  back: () => void;
  footer?: React.ReactNode;
  pageKey?: number;
  children: React.ReactNode;
}) {
  const { isRTL, fonts, language } = useI18n(),
    insets = useScreenInsets();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [pageKey]);
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: n.background, paddingTop: insets.top }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View
        style={{
          direction: 'ltr',
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 18,
          paddingBottom: 12,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={language === 'ar' ? 'رجوع' : 'Back'}
          onPress={back}
          style={{
            minWidth: 48,
            minHeight: 48,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather
            name={isRTL ? 'arrow-right' : 'arrow-left'}
            size={23}
            color={n.navy}
          />
        </Pressable>
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            accessibilityRole="header"
            style={{
              color: n.ink,
              fontFamily: fonts.bold,
              fontSize: 23,
              textAlign: isRTL ? 'right' : 'left',
            }}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={{
                color: n.muted,
                fontFamily: fonts.regular,
                textAlign: isRTL ? 'right' : 'left',
              }}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
          padding: 18,
          gap: 16,
          paddingBottom: 24,
        }}
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: 18,
            paddingTop: 12,
            paddingBottom: insets.bottom,
            gap: 8,
            borderTopWidth: 1,
            borderColor: n.border,
            backgroundColor: n.white,
          }}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
