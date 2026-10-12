import { mkdtemp, readFile, writeFile, mkdir, cp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const revision = "0fadfe00b29922668395ac4798308c9581f84d79";
async function command(executable: string, args: string[], cwd: string): Promise<void> {
  const child = spawn(executable, args, { cwd, stdio: "inherit" });
  await new Promise<void>((done, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? done() : reject(new Error(`${executable} failed (${String(code)})`)),
    );
  });
}

export async function buildNativeWorker(
  source: string | undefined,
  destination: string | undefined,
  kind: "text" | "media",
): Promise<void> {
  const binary = `native-${kind}`;
  const target = kind === "text" ? "SiftTextWorker" : "SiftMediaWorker";
  if (!source || !destination || process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error(
      `Usage on Apple Silicon: build-native-${kind} <sdk-checkout> <output-directory>`,
    );
  const output = resolve(destination);
  const root = await mkdtemp(join(tmpdir(), "sift-native-build-"));
  const sdk = join(root, "sdk");
  try {
    await command("git", ["clone", "--local", "--no-hardlinks", resolve(source), sdk], root);
    await command("git", ["checkout", "--detach", revision], sdk);
    const manifest = await readFile(join(sdk, "Package.swift"), "utf8");
    if (!manifest.includes("products: [") || !manifest.includes("targets: ["))
      throw new Error("Unsupported native SDK manifest");
    await writeFile(
      join(sdk, "Package.swift"),
      manifest
        .replace(
          "products: [",
          `products: [\n        .executable(name: "${binary}", targets: ["${target}"]),`,
        )
        .replace(
          "    targets: [",
          `    targets: [\n        .executableTarget(name: "${target}", dependencies: ["OmniKit"]),`,
        ),
    );
    await mkdir(join(sdk, `Sources/${target}`));
    await cp(
      resolve(import.meta.dirname, "../native/WorkerMemory.swift"),
      join(sdk, `Sources/${target}/WorkerMemory.swift`),
    );
    await cp(
      resolve(
        import.meta.dirname,
        `../native/${kind === "text" ? "text" : "media"}-search/Worker.swift`,
      ),
      join(sdk, `Sources/${target}/Worker.swift`),
    );
    const derived = resolve(process.env.SIFT_LIGHT_NATIVE_DERIVED_DATA ?? join(output, "build"));
    await command(
      "xcodebuild",
      ["-resolvePackageDependencies", "-scheme", binary, "-derivedDataPath", derived],
      sdk,
    );
    const artifact = join(
      derived,
      "SourcePackages/artifacts/swift-tokenizers/TokenizersRust/TokenizersRust.artifactbundle",
    );
    await command(
      "xcodebuild",
      [
        "-scheme",
        binary,
        "-destination",
        "platform=macOS",
        "-derivedDataPath",
        derived,
        `OTHER_SWIFT_FLAGS=$(inherited) -Xcc -fmodule-map-file=${artifact}/include/module.modulemap -Xcc -I${artifact}/include`,
        `OTHER_LDFLAGS=$(inherited) ${artifact}/apple-macos/libtokenizers_rust.a`,
        "build",
      ],
      sdk,
    );
    const products = join(derived, "Build/Products/Debug");
    await mkdir(output, { recursive: true });
    await cp(join(products, binary), join(output, binary));
    for (const name of ["mlx-swift_Cmlx.bundle", "swift-tokenizers_TokenizersFFI.bundle"]) {
      // oxlint-disable-next-line no-await-in-loop -- install both runtime resource bundles before reporting a complete worker.
      await cp(join(products, name), join(output, name), { recursive: true });
    }
    await command("codesign", ["--force", "--sign", "-", join(output, binary)], output);
    const bundles = (await readdir(output)).filter((name) => name.endsWith(".bundle"));
    await writeFile(
      join(output, "build.json"),
      JSON.stringify({ revision, architecture: process.arch, bundles }, null, 2) + "\n",
    );
    process.stdout.write(`Native ${kind} worker ready: ${join(output, binary)}\n`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
