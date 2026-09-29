package app.thalia.native_download;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/** Spools downloads to app-private storage; only one small chunk crosses the bridge at a time. */
final class DownloadArchive implements AutoCloseable {
    static final int MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
    static final int CHUNK_BYTES = 256 * 1024;
    private static final Pattern RELEASE_PATH = Pattern.compile("^/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\\.mod\\.zip$", Pattern.CASE_INSENSITIVE);
    private static final Set<String> REDIRECT_HOSTS = new HashSet<>(Arrays.asList(
        "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"
    ));
    private final File file;
    private volatile boolean cancelled;
    private volatile boolean complete;
    private volatile HttpURLConnection connection;

    interface Progress {
        void update(long loaded, long total);
    }

    DownloadArchive(File file) {
        this.file = file;
    }

    static URL validateSource(String source) throws Exception {
        URI uri = new URI(source);
        URL url = uri.toURL();
        validateHttps(url);
        if (!"github.com".equalsIgnoreCase(uri.getHost()) || !RELEASE_PATH.matcher(uri.getRawPath()).matches()) {
            throw new IOException("Only HTTPS GitHub Release .mod.zip assets are allowed");
        }
        return url;
    }

    private static void validateHttps(URL url) throws IOException {
        if (!"https".equalsIgnoreCase(url.getProtocol()) || url.getUserInfo() != null
                || (url.getPort() != -1 && url.getPort() != 443)) {
            throw new IOException("Only HTTPS downloads on the standard port are allowed");
        }
    }

    static URL validateRedirect(URL base, String location) throws IOException {
        URL target = new URL(base, location);
        validateHttps(target);
        if (!REDIRECT_HOSTS.contains(target.getHost().toLowerCase(Locale.ROOT))) {
            throw new IOException("GitHub redirected to an unsupported host");
        }
        return target;
    }

    long download(URL source, Progress progress) throws IOException {
        URL current = source;
        for (int redirects = 0; redirects <= 5; redirects++) {
            checkCancelled();
            HttpURLConnection request = (HttpURLConnection) current.openConnection();
            connection = request;
            request.setConnectTimeout(15_000);
            request.setReadTimeout(60_000);
            request.setInstanceFollowRedirects(false);
            request.setRequestProperty("Accept", "application/octet-stream");
            request.setRequestProperty("Accept-Encoding", "identity");
            request.setRequestProperty("User-Agent", "DoL-Thalia/1.0");
            try {
                checkCancelled();
                int status = request.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                    String location = request.getHeaderField("Location");
                    if (location == null) throw new IOException("GitHub redirect has no location");
                    current = validateRedirect(current, location);
                    continue;
                }
                if (status != 200) throw new IOException("GitHub returned HTTP " + status);
                long expected = request.getContentLengthLong();
                if (expected > MAX_ARCHIVE_BYTES) throw new IOException("Mod archive exceeds 128 MiB");
                try (InputStream input = request.getInputStream()) {
                    return copyToFile(input, expected, progress);
                }
            } finally {
                request.disconnect();
                connection = null;
            }
        }
        throw new IOException("Too many GitHub redirects");
    }

    long copyToFile(InputStream input, long expected, Progress progress) throws IOException {
        if (expected > MAX_ARCHIVE_BYTES) throw new IOException("Mod archive exceeds 128 MiB");
        long total = 0;
        long lastUpdate = 0;
        try (FileOutputStream output = new FileOutputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int read;
            checkCancelled();
            while ((read = input.read(buffer)) != -1) {
                checkCancelled();
                total += read;
                if (total > MAX_ARCHIVE_BYTES) throw new IOException("Mod archive exceeds 128 MiB");
                output.write(buffer, 0, read);
                long now = System.nanoTime();
                if (now - lastUpdate >= 200_000_000L) {
                    progress.update(total, Math.max(0, expected));
                    lastUpdate = now;
                }
            }
            checkCancelled();
            if (total == 0 || (expected >= 0 && total != expected)) throw new IOException("Incomplete mod archive download");
            complete = true;
            return total;
        } finally {
            // A reset may delete the path just before FileOutputStream recreates it.
            if (!complete || cancelled) file.delete();
        }
    }

    synchronized byte[] readChunk(long offset) throws IOException {
        checkCancelled();
        if (!complete) throw new IOException("Download is not complete");
        long length = file.length();
        if (offset < 0 || offset >= length) throw new IOException("Invalid archive offset");
        byte[] bytes = new byte[(int) Math.min(CHUNK_BYTES, length - offset)];
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(offset);
            input.readFully(bytes);
        }
        return bytes;
    }

    private void checkCancelled() throws IOException {
        if (cancelled) throw new IOException("Download cancelled");
    }

    @Override
    public void close() {
        cancelled = true;
        HttpURLConnection request = connection;
        if (request != null) request.disconnect();
        file.delete();
    }
}
