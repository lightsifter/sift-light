import { buildNativeWorker } from "./build-native-worker.js";
const [source, destination] = process.argv.slice(2);
await buildNativeWorker(source, destination, "text");
