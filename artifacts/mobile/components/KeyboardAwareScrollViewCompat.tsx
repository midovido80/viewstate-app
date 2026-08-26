import React, { forwardRef } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

interface Props extends ScrollViewProps {
  bottomOffset?: number;
}

export const KeyboardAwareScrollViewCompat = forwardRef<ScrollView, Props>(
  ({ bottomOffset = 0, keyboardShouldPersistTaps = "handled", ...props }, ref) => {
    return (
      <KeyboardAwareScrollView
        ref={ref}
        bottomOffset={bottomOffset}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      />
    );
  }
);
