import React, { forwardRef } from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
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
      ...props
    },
    ref,
  ) => {
    const sharedProps = {
      ...props,
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
