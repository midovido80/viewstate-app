import { Stack } from 'expo-router';

export default function CaptureLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="transaction" />
      <Stack.Screen name="property-type" />
      <Stack.Screen name="price" />
      <Stack.Screen name="location" />
      <Stack.Screen name="summary" />
      <Stack.Screen name="success" />
    </Stack>
  );
}
