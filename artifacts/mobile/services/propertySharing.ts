import { Share } from 'react-native';
import type { PropertySharePreview } from '@workspace/property-domain';
import {
  executePropertySharePreview,
  type SelectedLocalFileShareAdapter,
  type TextShareAdapter,
} from './propertyShareExecution';

export type {
  ResolvedLocalShareFile,
  SelectedLocalFileShareAdapter,
  TextShareAdapter,
} from './propertyShareExecution';

const reactNativeTextShare: TextShareAdapter = text => Share.share({
  message: text,
});

/**
 * Executes an already-reviewed preview without rebuilding it. Thus the text
 * shown in Preview is exactly the text sent. Selection is not stored or
 * written back to Property data.
 */
export async function sharePropertyPreview(
  preview: PropertySharePreview,
  fileAdapter?: SelectedLocalFileShareAdapter,
  shareText: TextShareAdapter = reactNativeTextShare,
): Promise<void> {
  await executePropertySharePreview(preview, fileAdapter, shareText);
}