package app.thalia.native_download;

import java.io.File;
import java.util.HashMap;
import java.util.Map;
import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PluginResult;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public final class NativeDownloadPlugin extends CordovaPlugin {
    private final Map<String, DownloadArchive> downloads = new HashMap<>();

    @Override
    public boolean execute(String action, JSONArray args, CallbackContext callback) throws JSONException {
        if (!"download".equals(action) && !"read".equals(action) && !"release".equals(action)) return false;
        String id = args.getString(0);
        if ("release".equals(action)) {
            release(id);
            callback.success();
            return true;
        }
        if ("read".equals(action)) {
            long offset = args.getLong(1);
            cordova.getThreadPool().execute(() -> {
                try {
                    DownloadArchive archive;
                    synchronized (downloads) { archive = downloads.get(id); }
                    if (archive == null) throw new IllegalStateException("Download is no longer available");
                    callback.sendPluginResult(new PluginResult(PluginResult.Status.OK, archive.readChunk(offset)));
                } catch (Exception error) {
                    callback.error(message(error));
                }
            });
            return true;
        }
        String source = args.getString(1);
        try {
            DownloadArchive.validateSource(source);
            DownloadArchive archive;
            synchronized (downloads) {
                if (downloads.size() >= 2 || downloads.containsKey(id)) throw new IllegalStateException("A download is already in progress");
                File directory = new File(cordova.getActivity().getCacheDir(), "thalia-mod-downloads");
                if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException("Cannot create download cache");
                // On a fresh session remove temporary files left by a terminated process.
                if (downloads.isEmpty()) {
                    File[] stale = directory.listFiles();
                    if (stale != null) for (File file : stale) file.delete();
                }
                archive = new DownloadArchive(File.createTempFile("mod-", ".zip", directory));
                downloads.put(id, archive);
            }
            cordova.getThreadPool().execute(() -> download(id, source, archive, callback));
        } catch (Exception error) {
            callback.error(message(error));
        }
        return true;
    }

    private void download(String id, String source, DownloadArchive archive, CallbackContext callback) {
        try {
            long size = archive.download(DownloadArchive.validateSource(source), (loaded, total) -> {
                PluginResult result = new PluginResult(PluginResult.Status.OK, progress(loaded, total, false));
                result.setKeepCallback(true);
                callback.sendPluginResult(result);
            });
            callback.success(progress(size, size, true));
        } catch (Exception error) {
            synchronized (downloads) {
                if (downloads.get(id) == archive) downloads.remove(id);
                archive.close();
            }
            callback.error(message(error));
        }
    }

    private static JSONObject progress(long loaded, long total, boolean done) {
        JSONObject result = new JSONObject();
        try {
            result.put("loaded", loaded);
            result.put("total", total);
            result.put("done", done);
        } catch (JSONException error) {
            throw new IllegalStateException(error);
        }
        return result;
    }

    private static String message(Exception error) {
        return error.getMessage() == null ? error.getClass().getSimpleName() : error.getMessage();
    }

    private void release(String id) {
        DownloadArchive archive;
        synchronized (downloads) { archive = downloads.remove(id); }
        if (archive != null) archive.close();
    }

    @Override
    public void onReset() {
        synchronized (downloads) {
            for (DownloadArchive archive : downloads.values()) archive.close();
            downloads.clear();
        }
    }

    @Override
    public void onDestroy() { onReset(); }
}
