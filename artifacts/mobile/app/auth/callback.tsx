import React from 'react';
import { Redirect } from 'expo-router';
/** The root gate exchanges and verifies the PKCE code before any routed app mounts. */
export default function AccountCallback() { return <Redirect href="/" />; }
