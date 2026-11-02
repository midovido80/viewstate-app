import React, { createContext, useContext } from 'react';
import type { GuestIdentity } from '@/services/guestAccount';
export interface GuestAccount {
  identity: GuestIdentity;
  activate(): Promise<void>;
  saveContact(name: string, phone: string): Promise<void>;
}
export function useGuestAccount() { return useContext(GuestContext); }
const GuestContext = createContext<GuestAccount | null>(null);
// Share the exact same context between the gate and account screens.
export const GuestAccountProvider = GuestContext.Provider;
