export interface ContactBatchSubmissionGuard {
  isRunning(): boolean;
  run<T>(operation: () => Promise<T>): Promise<T | undefined>;
}

export function createContactBatchSubmissionGuard(): ContactBatchSubmissionGuard {
  let running = false;

  return {
    isRunning: () => running,
    run: async <T>(operation: () => Promise<T>) => {
      if (running) return undefined;
      running = true;
      try {
        return await operation();
      } finally {
        running = false;
      }
    },
  };
}