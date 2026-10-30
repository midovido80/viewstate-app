import { Redirect } from 'expo-router';
/** Compatibility route; the former tab has no assigned replacement yet. */
export default function MoreRedirect() { return <Redirect href="/account" />; }
