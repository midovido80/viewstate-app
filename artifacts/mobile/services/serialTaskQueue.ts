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