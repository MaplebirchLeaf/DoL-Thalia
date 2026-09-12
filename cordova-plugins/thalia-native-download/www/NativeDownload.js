const exec = require('cordova/exec');
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
let nextId = 0;

function abortError() {
  const error = new Error('Download cancelled');
  error.name = 'AbortError';
  return error;
}

function release(id) {
  exec(
    () => {},
    () => {},
    'ThaliaNativeDownload',
    'release',
    [id]
  );
}

exports.download = async (url, { signal, onProgress } = {}) => {
  if (signal?.aborted) throw abortError();
  const id = `download-${Date.now()}-${++nextId}`;
  let rejectDownload;
  const onAbort = () => {
    release(id);
    rejectDownload?.(abortError());
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const size = await new Promise((resolve, reject) => {
      rejectDownload = reject;
      exec(
        event => {
          if (signal?.aborted) return reject(abortError());
          try {
            onProgress?.(event.loaded, event.total);
            if (event.done) resolve(event.total);
          } catch (error) {
            reject(error);
          }
        },
        error => reject(new Error(String(error))),
        'ThaliaNativeDownload',
        'download',
        [id, url]
      );
    });
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_ARCHIVE_BYTES) throw new Error('Invalid mod archive size');
    const archive = new Uint8Array(size);
    let offset = 0;
    while (offset < size) {
      if (signal?.aborted) throw abortError();
      const buffer = await new Promise((resolve, reject) => {
        rejectDownload = reject;
        exec(resolve, error => reject(new Error(String(error))), 'ThaliaNativeDownload', 'read', [id, offset]);
      });
      if (signal?.aborted) throw abortError();
      if (!(buffer instanceof ArrayBuffer)) throw new Error('Invalid mod archive chunk');
      const chunk = new Uint8Array(buffer);
      if (!chunk.length || chunk.length > 256 * 1024 || chunk.length > size - offset) throw new Error('Invalid mod archive chunk');
      archive.set(chunk, offset);
      offset += chunk.length;
    }
    return archive.buffer;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    release(id);
  }
};
