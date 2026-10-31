import React from 'react';
import { Stack } from 'expo-router';
import { useAccountFoundation } from '@/contexts/AccountFoundationContext';

export default function AccountLayout() {
  const { state } = useAccountFoundation();
  return <Stack screenOptions={{ headerShown: false, animation: state.reducedMotion ? 'none' : 'default' }} />;
}
