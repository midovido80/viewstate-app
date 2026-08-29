export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy: number | null;
}

export interface InjectedLocationSource {
  requestForegroundPermissionsAsync(): Promise<{ granted: boolean }>;
  getCurrentPositionAsync(options?: { accuracy?: any }): Promise<{
    coords: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
    };
  }>;
}

/** Pure permission/request flow; callers inject platform-specific accuracy. */
export async function requestInjectedCoordinates(
  source: InjectedLocationSource,
  platform: string,
  accuracy?: any,
): Promise<Coordinates> {
  if (platform === 'web') throw new Error('DEVICE_LOCATION_UNSUPPORTED_ON_WEB');
  const permission = await source.requestForegroundPermissionsAsync();
  if (!permission.granted) throw new Error('FOREGROUND_LOCATION_PERMISSION_DENIED');
  const position = await source.getCurrentPositionAsync({ accuracy });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy ?? null,
  };
}