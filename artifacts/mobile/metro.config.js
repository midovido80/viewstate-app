const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// expo-sqlite is imported by the shared native/web persistence adapter.
// Its web worker must resolve as an asset even when WebStore owns web storage.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm');
module.exports = config;
