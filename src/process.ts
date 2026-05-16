import { platform } from 'node:process';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
}

export async function run(command: string[], options: RunOptions = {}): Promise<void> {
  const text = command.join(' ');
  console.log(`执行命令：${text}`);

  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: {
      ...Bun.env,
      ...options.env
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  });

  const code = await child.exited;
  if (code !== 0) throw new Error(`命令执行失败，退出码：${code}，命令：${text}`);
}

export async function runShell(command: string, options: RunOptions = {}): Promise<void> {
  console.log(`执行命令：${command}`);

  const shellCommand = platform === 'win32' ? ['cmd', '/d', '/s', '/c', command] : ['sh', '-lc', command];

  const child = Bun.spawn(shellCommand, {
    cwd: options.cwd,
    env: {
      ...Bun.env,
      ...options.env
    },
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit'
  });

  const code = await child.exited;
  if (code !== 0) throw new Error(`命令执行失败，退出码：${code}，命令：${command}`);
}
