import { formatSeconds, logDone, logStep } from './log';

export async function runStep(name: string, action: () => Promise<void>): Promise<void> {
  logStep(name);
  await action();
}

export async function runTimedStep<T>(name: string, action: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  logStep(name);
  const result = await action();
  logDone(`Done in ${formatSeconds(startedAt)}`);
  return result;
}
