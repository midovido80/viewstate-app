package expo.modules.viewstateimport

import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import com.googlecode.tesseract.android.TessBaseAPI
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID
import java.util.concurrent.Executors

/** Explicit Sharesheet payloads only. No notification/chat/contact permission. */
class ViewStateImportModule : Module() {
  private val gate = Any()
  private val executor = Executors.newSingleThreadExecutor()
  private fun root(): File = File(requireNotNull(appContext.reactContext).filesDir, "viewstate-incoming").apply { mkdirs() }
  private fun validateId(id: String) { require(Regex("[a-zA-Z0-9_-]{1,100}").matches(id)) }

  override fun definition() = ModuleDefinition {
    Name("ViewStateImport")
    Events("incomingShare")
    OnCreate { enqueue(appContext.currentActivity?.intent) }
    OnActivityEntersForeground { enqueue(appContext.currentActivity?.intent) }
    OnDestroy { executor.shutdown() }
    OnNewIntent { intent ->
      if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
        appContext.currentActivity?.intent = intent
        enqueue(intent)
      }
    }
    AsyncFunction("pending") { owner: String ->
      require(Regex("viewstate-(users|guests)/[0-9a-f-]{36}").matches(owner) || owner == "legacy")
      synchronized(gate) {
        capture(appContext.currentActivity?.intent)
        root().listFiles()?.filter { it.isDirectory }?.sortedBy { it.name }?.mapNotNull { dir ->
          File(dir, "payload.json").takeIf { it.exists() }?.let { payload ->
            val json = JSONObject(payload.readText())
            val assigned = json.optString("owner", "")
            if (assigned.isNotEmpty() && assigned != owner) null else {
              if (assigned.isEmpty()) {
                json.put("owner", owner)
                val claim = File(dir, "owner.tmp")
                claim.writeText(json.toString())
                check(claim.renameTo(payload))
              }
              json.toString()
            }
          }
        } ?: emptyList<String>()
      }
    }
    AsyncFunction("acknowledge") { id: String ->
      synchronized(gate) { validateId(id); File(root(), id).deleteRecursively(); Unit }
    }
    AsyncFunction("dismissCurrent") {
      synchronized(gate) {
        appContext.currentActivity?.intent?.let { if (it.action in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) it.action = Intent.ACTION_MAIN }
        Unit
      }
    }
    AsyncFunction("recognize") { uri: String, ownerDirectory: String ->
      require(Regex("viewstate-(users|guests)/[0-9a-f-]{36}").matches(ownerDirectory))
      val context = requireNotNull(appContext.reactContext)
      val image = File(requireNotNull(Uri.parse(uri).path)).canonicalFile
      val owner = File(context.filesDir, ownerDirectory).canonicalFile
      require(Uri.parse(uri).scheme == "file" && image.path.startsWith(owner.path + File.separator))
      require(image.isFile && image.length() <= 20L * 1024 * 1024)
      val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(image.path, options)
      require(options.outWidth > 0 && options.outHeight > 0)
      var sample = 1
      while (options.outWidth / sample > 2400 || options.outHeight / sample > 2400) sample *= 2
      val bitmap = requireNotNull(BitmapFactory.decodeFile(image.path, BitmapFactory.Options().apply { inSampleSize = sample }))
      val base = File(context.filesDir, "viewstate-ocr")
      val data = File(base, "tessdata").apply { mkdirs() }
      for (lang in listOf("ara", "eng")) {
        val file = File(data, "$lang.traineddata")
        if (!file.exists()) {
          val temporary = File(data, "$lang.tmp")
          context.assets.open("viewstate-ocr/$lang.traineddata").use { input -> temporary.outputStream().use { input.copyTo(it) } }
          check(temporary.renameTo(file))
        }
      }
      val tess = TessBaseAPI()
      try {
        check(tess.init(base.absolutePath, "ara+eng"))
        tess.setImage(bitmap)
        mapOf("text" to tess.getUTF8Text().take(40000), "confidence" to tess.meanConfidence())
      } finally { tess.recycle(); bitmap.recycle() }
    }
  }

  private fun enqueue(intent: Intent?) {
    if (intent == null || intent.action !in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return
    try {
      executor.execute {
        try { synchronized(gate) { capture(intent) } } catch (_: Exception) { /* Retain the Activity intent for explicit retry. */ }
        try { sendEvent("incomingShare", emptyMap<String, String>()) } catch (_: Exception) { /* New JS context drains durable receipts. */ }
      }
    } catch (_: java.util.concurrent.RejectedExecutionException) { /* Module is being destroyed. */ }
  }

  @Suppress("DEPRECATION")
  private fun capture(intent: Intent?) {
    if (intent == null || intent.action !in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return
    val context = requireNotNull(appContext.reactContext)
    val id = intent.getStringExtra("viewstate.deliveryId") ?: UUID.randomUUID().toString().also { intent.putExtra("viewstate.deliveryId", it) }
    validateId(id)
    val dir = File(root(), id).apply { mkdirs() }
    val manifest = File(dir, "payload.json")
    if (manifest.exists()) { intent.action = Intent.ACTION_MAIN; return }
    try {
      var text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty()
      require(text.length <= 40000)
      val uris = mutableListOf<Uri>()
      if (intent.action == Intent.ACTION_SEND_MULTIPLE) uris.addAll(intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM) ?: emptyList())
      else intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }
      intent.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { if (!uris.contains(it)) uris.add(it) } }
      require(uris.size <= 20)
      val files = JSONArray()
      var total = 0L
      for (uri in uris) {
        if (uri.scheme in listOf("http", "https")) {
          if (!text.contains(uri.toString())) text += "\n$uri"
          require(text.length <= 40000)
          continue
        }
        require(uri.scheme == "content")
        val mime = context.contentResolver.getType(uri) ?: intent.type.orEmpty()
        val extension = mapOf("image/jpeg" to "jpg", "image/png" to "png", "image/webp" to "webp", "video/mp4" to "mp4", "video/quicktime" to "mov", "application/pdf" to "pdf")[mime]
        require(extension != null)
        var name = "attachment.$extension"
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
          if (cursor.moveToFirst()) name = cursor.getString(0)?.take(200) ?: name
        }
        val destination = File(dir, "${UUID.randomUUID()}.$extension")
        var size = 0L
        requireNotNull(context.contentResolver.openInputStream(uri)).use { input -> destination.outputStream().use { out ->
          val buffer = ByteArray(65536)
          while (true) {
            val count = input.read(buffer); if (count < 0) break
            size += count; total += count
            require(size <= 50L * 1024 * 1024 && total <= 150L * 1024 * 1024)
            out.write(buffer, 0, count)
          }
        } }
        files.put(JSONObject().put("uri", Uri.fromFile(destination).toString()).put("name", name).put("mimeType", mime))
      }
      require(text.isNotBlank() || files.length() > 0)
      val temp = File(dir, "payload.tmp")
      temp.writeText(JSONObject().put("id", id).put("text", text).put("files", files).toString())
      check(temp.renameTo(manifest))
      intent.action = Intent.ACTION_MAIN
    } catch (error: Exception) { dir.deleteRecursively(); throw error }
  }
}
