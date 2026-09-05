import { platform } from 'node:process';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  quiet?: boolean;
  printCommand?: boolean;
  printOutputOnError?: boolean;
}

export async function run(command: string[], options: RunOptions = {}): Promise<void> {
  await spawnAndWait(command, command.join(' '), options);
}

export async function runShell(command: string, options: RunOptions = {}): Promise<void> {
  const shellCommand = platform === 'win32' ? ['cmd', '/d', '/s', '/c', command] : ['sh', '-lc', command];
  await spawnAndWait(shellCommand, command, options);
}

async function spawnAndWait(argv: string[], label: string, options: RunOptions): Promise<void> {
  if (options.printCommand) console.log(`  $ ${label}`);

  const child = Bun.spawn(argv, {
    cwd: options.cwd,
    env: {
      ...Bun.env,
      ...options.env
    },
    stdin: 'inherit',
    stdout: options.quiet ? 'pipe' : 'inherit',
    stderr: options.quiet ? 'pipe' : 'inherit'
  });

  const output = options.quiet ? await readOutput(child) : '';
  const code = await child.exited;
  if (code !== 0) {
    if (options.printOutputOnError !== false && output.trim()) console.error(output.trimEnd());
    throw new Error(`命令失败（退出码 ${code}）：${label}`);
  }
}

async function readOutput(child: Bun.Subprocess<'inherit', 'pipe', 'pipe'>): Promise<string> {
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  return `${stdout}${stderr}`;
}
