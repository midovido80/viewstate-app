import React, { forwardRef } from 'react';
import { Platform, ScrollView, StyleSheet, ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface Props extends ScrollViewProps {
  bottomOffset?: number;
}

export const KeyboardAwareScrollViewCompat = forwardRef<ScrollView, Props>(
  (
    {
      bottomOffset = 0,
      keyboardDismissMode = 'on-drag',
      keyboardShouldPersistTaps = 'handled',
      nestedScrollEnabled = true,
      style,
      removeClippedSubviews = false,
      ...props
    },
    ref,
  ) => {
    const sharedProps = {
      ...props,
      style: [styles.viewport, style],
      removeClippedSubviews,
      keyboardDismissMode,
      keyboardShouldPersistTaps,
      nestedScrollEnabled,
    };

    if (Platform.OS === 'web') {
      return <ScrollView ref={ref} {...sharedProps} />;
    }

    return (
      <KeyboardAwareScrollView
        ref={ref}
        bottomOffset={bottomOffset}
        {...sharedProps}
      />
    );
  }
);

KeyboardAwareScrollViewCompat.displayName = 'KeyboardAwareScrollViewCompat';

const styles = StyleSheet.create({ viewport: { flex: 1, minHeight: 0 } });
