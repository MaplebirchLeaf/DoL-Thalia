package app.thalia.native_download;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.file.Files;

public final class DownloadArchiveTest {
    interface Action { void run() throws Exception; }
    static int assertions;
    static void check(boolean value) {
        assertions++;
        if (!value) throw new AssertionError("check " + assertions);
    }
    static void rejects(Action action) throws Exception {
        try { action.run(); } catch (Exception expected) { assertions++; return; }
        throw new AssertionError("Expected rejection");
    }
    static InputStream generated(long size) {
        return new InputStream() {
            long position;
            public int read() { return position++ < size ? 42 : -1; }
            public int read(byte[] target, int start, int count) {
                if (position >= size) return -1;
                int length = (int) Math.min(count, size - position);
                java.util.Arrays.fill(target, start, start + length, (byte) 42);
                position += length;
                return length;
            }
        };
    }
    public static void main(String[] args) throws Exception {
        File root = Files.createTempDirectory("thalia-download-test-").toFile();
        try {
            URL valid = DownloadArchive.validateSource("https://github.com/owner/repo/releases/download/v1/test.mod.zip");
            check(valid.getHost().equals("github.com"));
            check(DownloadArchive.validateSource("https://github.com/owner/repo/releases/download/release%2Fv1/test.mod.zip").getPath().contains("release%2Fv1"));
            rejects(() -> DownloadArchive.validateSource("http://github.com/owner/repo/releases/download/v1/test.mod.zip"));
            rejects(() -> DownloadArchive.validateSource("https://github.com:444/owner/repo/releases/download/v1/test.mod.zip"));
            rejects(() -> DownloadArchive.validateSource("https://user@github.com/owner/repo/releases/download/v1/test.mod.zip"));
            rejects(() -> DownloadArchive.validateSource("https://github.com/owner/repo/blob/v1/test.mod.zip"));
            rejects(() -> DownloadArchive.validateRedirect(valid, "https://example.com/test.zip"));
            rejects(() -> DownloadArchive.validateRedirect(valid, "http://release-assets.githubusercontent.com/test.zip"));
            check(DownloadArchive.validateRedirect(valid, "https://release-assets.githubusercontent.com/test.zip?signature=test").getProtocol().equals("https"));

            File file = new File(root, "large.zip");
            // This runs with a 16 MiB Java heap: the archive must never live entirely in Java memory.
            try (DownloadArchive archive = new DownloadArchive(file)) {
                long size = 32L * 1024 * 1024 + 19;
                check(archive.copyToFile(generated(size), size, (loaded, total) -> {}) == size);
                long offset = 0;
                int chunks = 0;
                while (offset < size) {
                    byte[] chunk = archive.readChunk(offset);
                    check(chunk.length <= DownloadArchive.CHUNK_BYTES);
                    check(chunk[0] == 42 && chunk[chunk.length - 1] == 42);
                    offset += chunk.length;
                    chunks++;
                }
                check(offset == size && chunks == 129);
                rejects(() -> archive.readChunk(-1));
                rejects(() -> archive.readChunk(size));
            }
            check(!file.exists());
            try (DownloadArchive archive = new DownloadArchive(file)) {
                rejects(() -> archive.copyToFile(new ByteArrayInputStream(new byte[3]), 4, (loaded, total) -> {}));
                check(!file.exists());
                rejects(() -> archive.readChunk(0));
            }
            try (DownloadArchive archive = new DownloadArchive(file)) {
                rejects(() -> archive.copyToFile(generated(1), DownloadArchive.MAX_ARCHIVE_BYTES + 1L, (loaded, total) -> {}));
                rejects(() -> archive.copyToFile(generated(DownloadArchive.MAX_ARCHIVE_BYTES + 1L), -1, (loaded, total) -> {}));
                check(!file.exists());
            }
            try (DownloadArchive archive = new DownloadArchive(file)) {
                rejects(() -> archive.copyToFile(generated(4 * 1024 * 1024), -1, (loaded, total) -> archive.close()));
                check(!file.exists());
            }
            System.out.println("Native archive: " + assertions + " assertions; 32 MiB archive with 16 MiB heap passed");
        } finally {
            File[] remaining = root.listFiles();
            if (remaining != null) for (File file : remaining) file.delete();
            root.delete();
        }
    }
}
