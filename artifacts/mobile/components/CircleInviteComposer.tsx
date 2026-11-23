import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import * as Crypto from 'expo-crypto';
import { Feather } from '@expo/vector-icons';
import { useI18n } from '@/contexts/I18nContext';
import { useRealAccount } from '@/contexts/RealAccountContext';
import { useUserData } from '@/contexts/UserDataContext';
import { useScreenInsets } from '@/hooks/useScreenInsets';
import { useColors } from '@/hooks/useColors';
import {
  circleRpc,
  listTrustCircles,
  type TrustCircle,
} from '@/services/circleMatchingApi';
import {
  canInvitePerson,
  circleInviteMessage,
  circleInviteUrl,
} from '@/services/circleInvitations';
import { filterPropertySourcePeople } from '@/services/propertySourceSelection';
import {
  normalizePhoneForCountry,
  type PhoneCountryCode,
} from '@/services/phoneEntry';
import { openWhatsAppComposeWithOpener } from '@/services/whatsappCompose';
import type { Person } from '@/services/people';
import { Button } from './Button';
import { TextInput } from './FormField';
import { CompactDropdown } from './FormChoices';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';
import { PhoneCountrySheet } from './PhoneCountrySheet';
import { PhoneNumberText } from './PhoneNumberText';

export function CircleInviteComposer({
  onClose,
  initialCircleId,
  person,
}: {
  onClose: () => void;
  initialCircleId?: string;
  person?: Person;
}) {
  const router = useRouter();
  const account = useRealAccount(),
    { store } = useUserData(),
    colors = useColors(),
    insets = useScreenInsets();
  const { language, fonts, isRTL } = useI18n(),
    ar = language === 'ar';
  const [circles, setCircles] = useState<TrustCircle[]>([]),
    [ready, setReady] = useState(false);
  const [circleId, setCircleId] = useState(initialCircleId ?? ''),
    [people, setPeople] = useState<Person[]>([]);
  const [recipient, setRecipient] = useState(person),
    [query, setQuery] = useState('');
  const [phone, setPhone] = useState(
    person?.normalizedPhone || person?.displayPhone || '',
  );
  const [country, setCountry] = useState<PhoneCountryCode>('KW'),
    [countryOpen, setCountryOpen] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [sharedText, setSharedText] = useState('');
  const flight = useRef(false),
    live = useRef(true),
    capability = useRef<
      { circle: string; phone: string; token: string } | undefined
    >(undefined);
  const L = (a: string, e: string) => (ar ? a : e);
  const text = {
    color: colors.foreground,
    fontFamily: fonts.regular,
    textAlign: isRTL ? ('right' as const) : ('left' as const),
    lineHeight: 24,
  };
  useEffect(() => {
    live.current = true;
    if (account)
      void Promise.all([listTrustCircles(account.request), store.getPeople()])
        .then(([all, contacts]) => {
          if (!live.current) return;
          const owned = all.filter(
            (circle) => circle.owner_id === account.profile.user_id,
          );
          setCircles(owned);
          setPeople(
            contacts.filter((contact) =>
              canInvitePerson(contact.classifications),
            ),
          );
          setCircleId((value) =>
            owned.some((circle) => circle.id === value) ? value : '',
          );
          setReady(true);
        })
        .catch(() => {
          if (live.current) {
            setReady(true);
            setError(
              L(
                'تعذّر تحميل الدوائر. أغلق الدعوة وافتحها مرة ثانية.',
                'Could not load circles. Reopen the invitation.',
              ),
            );
          }
        });
    return () => {
      live.current = false;
    };
  }, [account?.profile.user_id, store]);
  let international = '';
  try {
    international = normalizePhoneForCountry(phone, country);
  } catch {}
  const send = async (channel: 'app' | 'whatsapp') => {
    if (flight.current || !account) return;
    setError('');
    setNotice('');
    const circle = circles.find((item) => item.id === circleId);
    if (!circle) {
      setError(L('اختر الدائرة أولًا.', 'Choose a circle first.'));
      return;
    }
    if (!/^\+[1-9][0-9]{6,14}$/.test(international)) {
      setError(
        L(
          'راجع رقم المستلم مع كود الدولة.',
          'Review the recipient’s international number.',
        ),
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    try {
      if (channel === 'app') {
        const result = await circleRpc<{ status: string }>(
          account.request,
          'vs_circle_invite_phone',
          { p_circle: circle.id, p_phone: international },
        );
        if (!live.current) return;
        if (result.status === 'already_member') {
          setNotice(
            L(
              'هذا الشخص عضو في الدائرة بالفعل.',
              'This person is already a member.',
            ),
          );
          return;
        }
        if (result.status === 'rate_limited') {
          setError(
            L(
              'وصلت حد الدعوات المباشرة لهالساعة. جرّب لاحقًا أو استخدم واتساب.',
              'Direct invitation limit reached. Retry later or use WhatsApp.',
            ),
          );
          return;
        }
        if (result.status === 'pending') {
          setNotice(
            L(
              'الدعوة موجودة وبانتظار قبول المستلم.',
              'Invitation already pending.',
            ),
          );
          return;
        }
        if (result.status !== 'sent') {
          setError(
            L(
              'ما نقدر نرسل لهذا الرقم داخل التطبيق بدون رقم مؤكد. تقدر ترسل الدعوة عبر واتساب.',
              'In-app invitation requires a confirmed phone number. Use WhatsApp instead.',
            ),
          );
          return;
        }
        setNotice(
          L(
            'تم إرسال الدعوة داخل ViewState. المستلم يراجعها ويقبلها من دائرة الثقة.',
            'Invitation sent in ViewState. The recipient reviews and accepts it in Trust Circle.',
          ),
        );
      } else {
        if (
          capability.current?.circle !== circle.id ||
          capability.current?.phone !== international
        ) {
          const token = Array.from(Crypto.getRandomBytes(32), (value) =>
            value.toString(16).padStart(2, '0'),
          ).join('');
          await circleRpc(account.request, 'vs_circle_invite_link', {
            p_circle: circle.id,
            p_token: token,
          });
          capability.current = {
            circle: circle.id,
            phone: international,
            token,
          };
        }
        const message = circleInviteMessage(
          account.profile.display_name,
          circle.name,
          circleInviteUrl(capability.current.token),
          language,
        );
        if (!live.current) return;
        setSharedText(message);
        await openWhatsAppComposeWithOpener(
          `phone=${encodeURIComponent(international.replace(/\D/g, ''))}&text=${encodeURIComponent(message)}`,
          Linking,
        );
        if (live.current)
          setNotice(
            L(
              'فتحنا واتساب بالدعوة الجاهزة. راجع الرسالة واضغط إرسال هناك.',
              'WhatsApp opened with the invitation. Review and press Send there.',
            ),
          );
      }
    } catch {
      if (live.current)
        setError(
          L(
            'تعذّر فتح الإرسال. الدعوة باقية هنا؛ تقدر تشارك النص أو تعيد المحاولة.',
            'Could not open sending. Share the prepared text or retry.',
          ),
        );
    } finally {
      flight.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <Modal
      visible
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <KeyboardAvoidingView
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: '#00000066',
        }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          testID="circle-invite-composer"
          accessibilityViewIsModal
          style={{
            height: '88%',
            backgroundColor: colors.card,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            padding: 18,
            paddingBottom: insets.bottom,
            gap: 12,
          }}
        >
          <View
            style={{
              direction: 'ltr',
              flexDirection: isRTL ? 'row-reverse' : 'row',
              alignItems: 'center',
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ ...text, flex: 1, fontFamily: fonts.bold, fontSize: 23 }}
            >
              {L('دعوة لدائرة الثقة', 'Invite to Trust Circle')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={L('إغلاق الدعوة', 'Close invitation')}
              disabled={busy}
              onPress={onClose}
              style={{
                width: 48,
                height: 48,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Feather name="x" size={22} color={colors.foreground} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={{ gap: 14, paddingBottom: 16 }}
          >
            {!account ? (
              <>
                <Text style={text}>
                  {L(
                    'سجّل الدخول عشان ترسل دعوة من حسابك.',
                    'Sign in to invite colleagues.',
                  )}
                </Text>
                <Button
                  title={L('تسجيل الدخول', 'Sign in')}
                  onPress={() => {
                    onClose();
                    router.push('/account/account');
                  }}
                />
              </>
            ) : !ready ? (
              <Text style={text}>
                {L('جارٍ تحميل دوائرك…', 'Loading your circles…')}
              </Text>
            ) : !circles.length ? (
              <>
                <Text style={text}>
                  {L(
                    'الدعوات يرسلها مسؤول الدائرة. أنشئ دائرة أو اطلب من مسؤول دائرتك إرسال الدعوة.',
                    'Only circle owners send invitations. Create a circle or ask its owner.',
                  )}
                </Text>
                <Button
                  title={L('إنشاء دائرة', 'Create a circle')}
                  onPress={() => {
                    onClose();
                    router.push({
                      pathname: '/trust-circle',
                      params: { create: '1' },
                    } as never);
                  }}
                />
              </>
            ) : (
              <>
                <CompactDropdown
                  label={L('1. أي دائرة تبي تدعوه لها؟', '1. Choose a circle')}
                  testID="invite-circle-picker"
                  options={circles.map((circle) => ({
                    value: circle.id,
                    label: circle.name,
                    selected: circle.id === circleId,
                  }))}
                  onSelect={(value) => {
                    if (flight.current) return;
                    setCircleId(value);
                    setError('');
                    setNotice('');
                    setSharedText('');
                    capability.current = undefined;
                  }}
                />
                <Text style={text}>
                  {L(
                    'الدعوة متاحة للدوائر اللي تديرها.',
                    'You can invite to circles you own.',
                  )}
                </Text>
                <Text style={{ ...text, fontFamily: fonts.bold }}>
                  {L('2. منو تبي تدعو؟', '2. Choose a colleague')}
                </Text>
                {!person && (
                  <>
                    <TextInput
                      testID="invite-person-search"
                      accessibilityLabel={L(
                        'ابحث عن زميل',
                        'Search colleagues',
                      )}
                      placeholder={L(
                        'ابحث بالاسم أو رقم الهاتف',
                        'Search name or phone',
                      )}
                      value={query}
                      editable={!busy}
                      onChangeText={setQuery}
                      style={{
                        ...text,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        padding: 12,
                      }}
                    />
                    {filterPropertySourcePeople(people, 'all', query)
                      .slice(0, 6)
                      .map((item) => (
                        <Button
                          key={item.id}
                          title={
                            (recipient?.id === item.id ? '✓ ' : '') + item.name
                          }
                          variant="outline"
                          disabled={busy}
                          onPress={() => {
                            if (flight.current) return;
                            setSharedText('');
                            setNotice('');
                            capability.current = undefined;
                            setRecipient(item);
                            setPhone(item.normalizedPhone || item.displayPhone);
                            setError('');
                          }}
                        />
                      ))}
                  </>
                )}
                {recipient && (
                  <Text style={{ ...text, fontFamily: fonts.bold }}>
                    {recipient.name}
                  </Text>
                )}
                <View
                  style={{
                    direction: 'ltr',
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                    gap: 8,
                  }}
                >
                  <Button
                    title={country}
                    variant="outline"
                    disabled={busy}
                    onPress={() => {
                      if (!flight.current) setCountryOpen(true);
                    }}
                  />
                  <TextInput
                    testID="invite-phone"
                    accessibilityLabel={L('رقم المدعو', 'Invitee phone')}
                    keyboardType="phone-pad"
                    value={phone}
                    editable={!busy}
                    onChangeText={(value) => {
                      if (flight.current) return;
                      setSharedText('');
                      setNotice('');
                      capability.current = undefined;
                      setPhone(value);
                      setRecipient(undefined);
                    }}
                    style={{
                      ...text,
                      flex: 1,
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 12,
                      padding: 12,
                      textAlign: 'left',
                      writingDirection: 'ltr',
                    }}
                  />
                </View>
                <PhoneNumberText style={{ color: colors.primary }}>
                  {international || phone}
                </PhoneNumberText>
                <Text style={{ ...text, fontFamily: fonts.bold }}>
                  {L('3. شلون تبي ترسل الدعوة؟', '3. Choose how to send')}
                </Text>
                <Button
                  testID="invite-send-app"
                  title={L('إرسال عبر ViewState', 'Send in ViewState')}
                  loading={busy}
                  disabled={busy}
                  onPress={() => void send('app')}
                />
                <Text style={text}>
                  {L(
                    'للرقم المؤكد داخل التطبيق. إذا ما توفر، استخدم واتساب.',
                    'For a confirmed in-app phone number. Otherwise use WhatsApp.',
                  )}
                </Text>
                <Button
                  testID="invite-send-whatsapp"
                  title={L('إرسال عبر واتساب', 'Send via WhatsApp')}
                  variant="whatsapp"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void send('whatsapp')}
                />
                <Text style={text}>
                  {L(
                    'بيظهر اسم حسابك واسم الدائرة، بدون معرّف الحساب. المستلم يراجع الدعوة ويقبلها بنفسه.',
                    'Shows your account name and circle, without account IDs. The recipient reviews and accepts.',
                  )}
                </Text>
              </>
            )}
            {!!error && (
              <Text
                accessibilityRole="alert"
                style={{ ...text, color: colors.destructive }}
              >
                {error}
              </Text>
            )}
            {!!notice && (
              <Text accessibilityLiveRegion="polite" style={text}>
                {notice}
              </Text>
            )}
            {!!sharedText && (
              <>
                <Text selectable style={text}>
                  {sharedText}
                </Text>
                <Button
                  title={L('مشاركة نص الدعوة', 'Share invitation text')}
                  variant="outline"
                  onPress={() => {
                    void Share.share({ message: sharedText }).catch(() =>
                      setError(
                        L(
                          'تعذّرت المشاركة. أعد المحاولة.',
                          'Could not share. Retry.',
                        ),
                      ),
                    );
                  }}
                />
              </>
            )}
          </KeyboardAwareScrollViewCompat>
          <Button
            title={L('رجوع', 'Back')}
            variant="outline"
            disabled={busy}
            onPress={onClose}
          />
        </View>
        {countryOpen && (
          <PhoneCountrySheet
            country={country}
            onClose={() => setCountryOpen(false)}
            onSelect={(value) => {
              if (flight.current) return;
              capability.current = undefined;
              setSharedText('');
              setNotice('');
              setCountry(value);
              setCountryOpen(false);
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}
