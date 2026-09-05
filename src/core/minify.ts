import { minify } from 'terser';

/** Minify a JavaScript source string (2 compress passes, mangled, no comments). */
export async function minifyJs(source: string): Promise<string> {
  const result = await minify(source, {
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false }
  });
  if (!result.code) throw new Error('JS minify failed.');
  return result.code;
}
