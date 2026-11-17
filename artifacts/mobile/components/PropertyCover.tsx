import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Property } from '@workspace/property-domain';
import { useUserData } from '@/contexts/UserDataContext';
import { useI18n } from '@/contexts/I18nContext';
import { resolveWebAttachmentImageSources } from '@/services/attachmentOperations';

/** Resolve only the visible saved cover, within the active user's media store. */
export function PropertyCover({ property, style, label }: { property?: Property | null; style?: StyleProp<ViewStyle>; label?: string }) {
  const { media } = useUserData(), { language, fonts } = useI18n();
  const images = property?.attachments?.filter(a => a.kind === 'image') ?? [];
  const cover = images.find(a => a.isCover) ?? images[0];
  const key = cover ? `${property?.core.id}:${cover.id}:${cover.managedUri}` : '';
  const [resolved, setResolved] = useState<{ key: string; uri: string } | null>(null);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    let alive = true, revoke: (() => void) | undefined;
    setFailed('');
    if (!cover) { setResolved(null); return; }
    if (Platform.OS !== 'web') {
      try { media.access?.assertUri(cover.managedUri); setResolved({ key, uri: cover.managedUri }); }
      catch { setFailed(key); }
      return;
    }
    void (async () => resolveWebAttachmentImageSources([{ id: cover.id, kind: 'image', uri: cover.managedUri }], media.createIndexedDbWebAttachmentBlobStore()))()
      .then(value => { if (!alive) { value.revoke(); return; } revoke = value.revoke; setResolved({ key, uri: value.sources[cover.id] }); })
      .catch(() => { if (alive) setFailed(key); });
    return () => { alive = false; revoke?.(); };
  }, [key, media]);
  const uri = resolved?.key === key && failed !== key ? resolved.uri : undefined;
  return <View testID="saved-property-cover" style={[s.cover, style]}>
    {uri ? <Image accessibilityLabel={label} source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} onError={() => setFailed(key)} /> : <View style={s.empty}><Feather name={property ? 'home' : 'file-text'} size={28} color="#8BA0C3" /><Text style={{ fontFamily: fonts.regular, color: '#62738D', fontSize: 11, textAlign: 'center' }}>{property ? language === 'ar' ? cover ? failed === key ? 'الصورة غير متاحة' : 'تحميل الصورة…' : 'بدون صورة' : cover ? failed === key ? 'Photo unavailable' : 'Loading photo…' : 'No photo' : language === 'ar' ? 'طلب عقار' : 'Property request'}</Text></View>}
  </View>;
}
const s = StyleSheet.create({ cover: { backgroundColor: '#EAF0F8', overflow: 'hidden' }, empty: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 7 } });
