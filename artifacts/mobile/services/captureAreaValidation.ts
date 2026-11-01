export interface CaptureAreaValidationState {
  readonly required: boolean;
}

export type CaptureAreaValidationEvent =
  | { readonly type: 'preview'; readonly selected: boolean }
  | { readonly type: 'select' }
  | { readonly type: 'cancel' };

export function transitionCaptureAreaValidation(
  current: CaptureAreaValidationState,
  event: CaptureAreaValidationEvent,
): CaptureAreaValidationState {
  if (event.type === 'preview') return { required: !event.selected };
  if (event.type === 'select') return { required: false };
  return current;
}