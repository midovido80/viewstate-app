const { withAndroidManifest } = require("expo/config-plugins");
module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const activity = mod.modResults.manifest.application[0].activity.find(
      (a) => a.$["android:name"] === ".MainActivity",
    );
    if (!activity) throw Error("IMPORT_MAIN_ACTIVITY_MISSING");
    activity.$["android:launchMode"] = "singleTask";
    activity["intent-filter"] ??= [];
    for (const action of ["SEND", "SEND_MULTIPLE"]) {
      const name = `android.intent.action.${action}`;
      activity["intent-filter"] = activity["intent-filter"].filter(
        (f) => !f.action?.some((a) => a.$["android:name"] === name),
      );
      activity["intent-filter"].push({
        action: [{ $: { "android:name": name } }],
        category: [
          { $: { "android:name": "android.intent.category.DEFAULT" } },
        ],
        data: [
          "text/plain",
          "image/jpeg",
          "image/png",
          "image/webp",
          "video/mp4",
          "video/quicktime",
          "application/pdf",
        ].map((type) => ({ $: { "android:mimeType": type } })),
      });
    }
    return mod;
  });
