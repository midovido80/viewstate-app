import { SerialTaskQueue } from "./serialTaskQueue";

const queues = new Map<string, SerialTaskQueue>();
export function serializePushRegistration(
  owner: string,
  work: () => Promise<void>,
) {
  let queue = queues.get(owner);
  if (!queue) {
    queue = new SerialTaskQueue();
    queues.set(owner, queue);
  }
  return queue.enqueue(work);
}
interface Registration {
  read(): Promise<string | null>;
  permission(): Promise<boolean>;
  deviceToken(): Promise<string>;
  register(token: string): Promise<void>;
  write(token: string): Promise<void>;
  remove(token: string): Promise<void>;
}
export async function refreshPushRegistration(
  registration: Registration,
): Promise<void> {
  const previous = await registration.read();
  if (!previous || !(await registration.permission())) return;
  const token = await registration.deviceToken();
  if (!token) throw Error("CIRCLE_PUSH_TOKEN_UNAVAILABLE");
  await registration.register(token);
  if (token !== previous) {
    await registration.write(token);
    await registration.remove(previous);
  }
}
