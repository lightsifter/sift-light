function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function validateNpmPublishOutput(stdout: string, stderr: string, expectedId: string): void {
  if (stderr.includes("auto-corrected") || stderr.includes("errors corrected")) {
    throw new Error(`npm would rewrite the published package metadata\n${stderr}`);
  }

  const parsed: unknown = JSON.parse(stdout);
  if (!isRecord(parsed)) throw new Error("npm publish dry run returned invalid JSON");
  const directManifest = parsed.id === expectedId ? parsed : undefined;
  const packageName = expectedId.slice(0, expectedId.lastIndexOf("@"));
  const nestedManifest = parsed[packageName];
  const manifest = directManifest ?? (isRecord(nestedManifest) ? nestedManifest : undefined);
  if (manifest?.id !== expectedId || !Array.isArray(manifest.files)) {
    throw new Error("npm publish dry run returned an unexpected package manifest");
  }
}

async function main(): Promise<void> {
  const npmVersion = (await Bun.file(".npm-version").text()).trim();
  if (!/^\d+\.\d+\.\d+$/.test(npmVersion)) throw new Error(".npm-version is invalid");
  const command = [
    "npx",
    "--yes",
    `npm@${npmVersion}`,
    "publish",
    "--dry-run",
    "--json",
    "--access",
    "public",
    "--tag",
    "latest",
  ];
  const subprocess = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(`npm publish dry run failed (${exitCode})\n${stderr}${stdout}`);
  }

  const packageJson: unknown = await Bun.file("package.json").json();
  if (
    !isRecord(packageJson) ||
    typeof packageJson.name !== "string" ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error("package.json must contain string name and version fields");
  }
  const expectedId = `${packageJson.name}@${packageJson.version}`;
  validateNpmPublishOutput(stdout, stderr, expectedId);
  process.stdout.write(`npm ${npmVersion} publish dry run verified ${expectedId}\n`);
}

if (import.meta.main) await main();
