package app.thalia.native_download;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;

public final class NativeDownloadPlugin extends CordovaPlugin {
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final int MAX_REDIRECTS = 5;
    private static final int MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
    private static final Pattern RELEASE_PATH = Pattern.compile("^/[^/]+/[^/]+/releases/download/[^/]+/[^/]+\\.mod\\.zip$");
    private static final Set<String> REDIRECT_HOSTS = new HashSet<>(Arrays.asList(
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com"
    ));

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if (!"download".equals(action)) return false;
        String source = args.getString(0);
        cordova.getThreadPool().execute(() -> download(source, callback));
        return true;
    }

    private void download(String source, CallbackContext callback) {
        try {
            URL url = validateSource(source);
            byte[] archive = readArchive(url);
            callback.sendPluginResult(new PluginResult(PluginResult.Status.OK, archive));
        } catch (Exception error) {
            callback.error(error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage());
        }
    }

    private static URL validateSource(String source) throws Exception {
        URI uri = new URI(source);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || !"github.com".equalsIgnoreCase(uri.getHost())) {
            throw new IOException("Only HTTPS GitHub downloads are allowed");
        }
        if (!RELEASE_PATH.matcher(uri.getPath()).matches()) {
            throw new IOException("Only GitHub Release .mod.zip assets are allowed");
        }
        return uri.toURL();
    }

    private static byte[] readArchive(URL initialUrl) throws IOException {
        URL currentUrl = initialUrl;
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect++) {
            HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/octet-stream");
            connection.setRequestProperty("User-Agent", "DoL-Thalia/1.0");

            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("GitHub redirect has no location");
                    currentUrl = validateRedirect(currentUrl, location);
                    continue;
                }
                if (status < 200 || status >= 300) throw new IOException("GitHub returned HTTP " + status);
                long contentLength = connection.getContentLengthLong();
                if (contentLength > MAX_ARCHIVE_BYTES) throw new IOException("Mod archive exceeds 128 MiB");
                return readLimited(connection.getInputStream());
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("Too many GitHub redirects");
    }

    private static URL validateRedirect(URL base, String location) throws IOException {
        URL target = new URL(base, location);
        if (!"https".equalsIgnoreCase(target.getProtocol()) || !REDIRECT_HOSTS.contains(target.getHost().toLowerCase(Locale.ROOT))) {
            throw new IOException("GitHub redirected to an unsupported host");
        }
        return target;
    }

    private static byte[] readLimited(InputStream input) throws IOException {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[64 * 1024];
            int total = 0;
            int read;
            while ((read = stream.read(buffer)) != -1) {
                total += read;
                if (total > MAX_ARCHIVE_BYTES) throw new IOException("Mod archive exceeds 128 MiB");
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }
}
