import React, { useRef } from 'react';
import { Platform, View } from 'react-native';
import { LocationAttachmentButton } from '@/components/LocationAttachmentUI';

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
    <View style={{ flex: 1, minWidth: 0 }}>
      <LocationAttachmentButton
        label={label}
        icon={accept.startsWith('image') ? 'image' : accept.startsWith('video') ? 'video' : 'file-text'}
        tile
        disabled={disabled}
        onPress={() => input.current?.click()}
        testID={testID}
      />
      <input
        ref={input}
        type="file"
        tabIndex={-1}
        disabled={disabled}
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
