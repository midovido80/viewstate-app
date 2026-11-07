import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
interface IncomingImportNative {
  pending(owner: string): Promise<string[]>;
  dismissCurrent(): Promise<void>;
  acknowledge(id: string): Promise<void>;
  recognize(
    uri: string,
    ownerDirectory: string,
  ): Promise<{ text: string; confidence: number }>;
  addListener(name: string, listener: () => void): { remove(): void };
}
// Old APK/Expo Go/web can still paste and review. Never crash at module import.
export const incomingImportNative =
  Platform.OS === "android"
    ? requireOptionalNativeModule<IncomingImportNative>("ViewStateImport")
    : null;
