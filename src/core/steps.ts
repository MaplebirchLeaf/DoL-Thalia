import { formatSeconds, logDone, logStep } from './log';

export async function runStep(name: string, action: () => Promise<void>): Promise<void> {
  logStep(name);
  await action();
}

export async function runTimedStep(name: string, action: () => Promise<void>): Promise<void> {
  const startedAt = Date.now();
  logStep(name);
  await action();
  logDone(`Done in ${formatSeconds(startedAt)}`);
}
