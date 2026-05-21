export function logStep(name: string): void {
  console.log(`\n• ${name}`);
}

export function logDone(message: string): void {
  console.log(`  ✓ ${message}`);
}

export function logInfo(message: string): void {
  console.log(`  ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`  ! ${message}`);
}

export function formatSeconds(startedAt: number): string {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}
