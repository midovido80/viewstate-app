import React, { useRef } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  label: string;
  accept: string;
  testID: string;
  disabled?: boolean;
  onFiles: (files: readonly { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }[]) => void;
};

export function AttachmentPickerControl({ label, accept, testID, disabled, onFiles }: Props) {
  const input = useRef<HTMLInputElement>(null);
  if (Platform.OS !== 'web') return null;
  return (
    <View>
      <TouchableOpacity
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => input.current?.click()}
        testID={testID}
      >
        <Text>{label}</Text>
      </TouchableOpacity>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        aria-label={label}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
        onChange={event => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = '';
          onFiles(files);
        }}
      />
    </View>
  );
}