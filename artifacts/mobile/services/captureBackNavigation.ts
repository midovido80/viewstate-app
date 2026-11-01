import { getPropertyTypeSelectionRoute, type PropertyFormSelection } from './propertyFormRoutes.ts';

/** Leave the form through navigation history; Preview Back only returns to editing. */
export function getCaptureBackAction(
  stage: 1 | 2 | 3,
  canGoBack: boolean,
  context: Pick<PropertyFormSelection, 'mode' | 'transaction' | 'linkPersonId' | 'sourceRole'>,
) {
  if (stage === 3) return { kind: 'edit' as const };
  if (canGoBack) return { kind: 'back' as const };
  return { kind: 'select-type' as const, route: getPropertyTypeSelectionRoute(context) };
}
