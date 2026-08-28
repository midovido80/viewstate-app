export class SerialTaskQueue {
  private pending: Promise<void> = Promise.resolve();

  enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.pending.then(task, task);
    this.pending = run.catch(() => undefined);
    return run;
  }

  flush(): Promise<void> {
    return this.pending;
  }
}

export class StoredValueParseError extends Error {
  constructor(cause: unknown) {
    super('Stored value could not be parsed.');
    this.name = 'StoredValueParseError';
    this.cause = cause;
  }
}

export function parseStoredJson<T>(raw: string | null): T | null {
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new StoredValueParseError(error);
  }
}

export class SingleFlight {
  private active = false;

  async run<T>(task: () => Promise<T>): Promise<{ started: true; value: T } | { started: false }> {
    if (this.active) return { started: false };

    this.active = true;
    try {
      return { started: true, value: await task() };
    } finally {
      this.active = false;
    }
  }
}

export type SaveWithCleanupResult =
  | { status: 'complete'; propertySaved: true }
  | { status: 'save_failed'; propertySaved: false; error: unknown }
  | { status: 'cleanup_failed'; propertySaved: true; error: unknown };

export async function runSaveWithCleanup(options: {
  propertyAlreadySaved: boolean;
  saveProperty: () => Promise<void>;
  cleanupDraft: () => Promise<void>;
}): Promise<SaveWithCleanupResult> {
  if (!options.propertyAlreadySaved) {
    try {
      await options.saveProperty();
    } catch (error) {
      return { status: 'save_failed', propertySaved: false, error };
    }
  }

  try {
    await options.cleanupDraft();
    return { status: 'complete', propertySaved: true };
  } catch (error) {
    return { status: 'cleanup_failed', propertySaved: true, error };
  }
}