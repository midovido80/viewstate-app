import React, { createContext, useContext, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, Text, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { useI18n } from '@/contexts/I18nContext';
import { missingCompletionFields, type CompletionField } from '@/services/requiredMatchingFields';

type Controller = ReturnType<typeof useRequiredForm>;
const Context = createContext<Controller | null>(null);
export const RequiredFormProvider = Context.Provider;
const RequiredLabelContext = createContext(false);
export function RequiredLabelText(props: React.ComponentProps<typeof Text>) {
  const required = useContext(RequiredLabelContext);
  return <Text {...props}>{props.children}{required && <RequiredStar />}</Text>;
}
export function RequiredStar() { return <Text style={{ color: '#C62828', fontSize: 14 }}> *</Text>; }
export function useRequiredForm(fields: readonly CompletionField[]) {
  const [attempted, setAttempted] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const viewportRef = useRef<View>(null);
  const targets = useRef<Record<string, View | null>>({});
  const offset = useRef(0);
  const pending = useRef<string | null>(null);
  const focus = (id: string) => {
    pending.current = id;
    requestAnimationFrame(() => {
      const target = targets.current[id];
      const viewport = viewportRef.current;
      const scroll = scrollRef.current;
      if (!target || !viewport || !scroll) return; // A different step registers its target after rendering.
      target.measureInWindow((_x, y) => viewport.measureInWindow((_sx, sy) => {
        if (pending.current !== id) return;
        scroll.scrollTo({ y: Math.max(0, offset.current + y - sy - 20), animated: true });
        pending.current = null;
      }));
    });
  };
  return {
    fields, attempted, scrollRef, viewportRef,
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => { offset.current = event.nativeEvent.contentOffset.y; },
    register: (id: string, view: View | null) => { targets.current[id] = view; if (view && pending.current === id) focus(id); },
    validate: (snapshot: readonly CompletionField[] = fields) => {
      setAttempted(true);
      const missing = missingCompletionFields(snapshot);
      if (missing.length) { AccessibilityInfo.announceForAccessibility('Required fields / حقول مطلوبة'); focus(missing[0]); }
      return missing;
    },
    focus,
  };
}
/** The same wrapper handles typed inputs, numeric picks and selection controls. */
export function RequiredField({ id, children, label }: { id: string; children: React.ReactNode; label?: string }) {
  const form = useContext(Context);
  const { language, fonts, isRTL } = useI18n();
  const field = form?.fields.find(item => item.id === id);
  if (!field) return <>{children}</>;
  const invalid = form!.attempted && !field.valid;
  let marked = !!label;
  const markFirstLabel = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, node => {
    if (marked || !React.isValidElement<{ children?: React.ReactNode }>(node)) return node;
    if (node.type === Text) {
      marked = true;
      return React.cloneElement(node, {}, node.props.children, <RequiredStar key="required-star" />);
    }
    if (node.type === React.Fragment || node.type === View) return React.cloneElement(node, {}, markFirstLabel(node.props.children));
    return node;
  });
  const content = markFirstLabel(children);
  return <View collapsable={false} ref={view => form!.register(id, view)} testID={`required-${id}`} style={{ gap: 6, ...(invalid ? { borderWidth: 1, borderColor: '#C62828', backgroundColor: '#FFF7F7', borderRadius: 10, padding: 8 } : {}) }}>
    {label && <Text style={{ color: '#173F78', fontFamily: fonts.semiBold, textAlign: isRTL ? 'right' : 'left' }}>{label}<RequiredStar /></Text>}
    <RequiredLabelContext.Provider value={!marked}>{content}</RequiredLabelContext.Provider>
    {invalid && <Text accessibilityRole="alert" style={{ color: '#C62828', fontFamily: fonts.regular }}>{language === 'ar' ? 'هذا الحقل مطلوب؛ أدخل قيمة صالحة للمتابعة.' : 'This field is required. Enter a valid value to continue.'}</Text>}
  </View>;
}
export function RequiredFormHint() {
  const { language } = useI18n();
  return <Text style={{ color: '#64748B', marginBottom: 10 }}><RequiredStar /> {language === 'ar' ? 'حقول مطلوبة لاستكمال التفاصيل' : 'Required to complete details'}</Text>;
}
