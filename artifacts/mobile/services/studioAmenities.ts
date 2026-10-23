/** Studio facts and preferences use the same approved meanings, without bedroom-only extras. */
export const STUDIO_FEATURES = [
  { field: 'hasCentralAC', label: ['Central air conditioning', 'تكييف مركزي'] },
  { field: 'hasSecurityGuard', amenity: 'security_guard', label: ['Security / Guard', 'أمن / حارس'] },
  { field: 'hasElevator', amenity: 'elevator', label: ['Elevator in building', 'مصعد بالمبنى'] },
  { field: 'hasSplitAC', label: ['Split air conditioning', 'تكييف وحدات / سبليت'] },
  { field: 'hasBalcony', amenity: 'balcony', label: ['Balcony', 'بلكونة'] },
  { field: 'hasSharedPool', label: ['Shared pool in building', 'مسبح مشترك بالمبنى'] },
  { field: 'hasSharedGym', label: ['Shared gym in building', 'جيم مشترك بالمبنى'] },
  { field: 'hasSeaView', label: ['Sea view', 'إطلالة بحرية'] },
] as const;
export type StudioFeatureField = typeof STUDIO_FEATURES[number]['field'];
