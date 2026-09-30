import { access, copyFile, mkdir } from "fs/promises";
import { constants } from "fs";
import { spawn } from "child_process";
import path from "path";

export type RunLocalScriptResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
};

const isVercel = Boolean(process.env.VERCEL);

const runtimeDataDir = isVercel
  ? "/tmp/leadgrid-data"
  : path.join(process.cwd(), "data");

export async function scriptExists(scriptPath: string) {
  try {
    await access(path.join(process.cwd(), scriptPath), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function runNodeScript(
  scriptPath: string,
  timeoutMs = 20 * 60 * 1000
): Promise<RunLocalScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        LEADGRID_DATA_DIR: runtimeDataDir
      }
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\nTimed out after ${timeoutMs}ms`.trim()
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr
      });
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim()
      });
    });
  });
}

const seedFiles = ["saas-conference-source-pages.json", "open-lead-rss-sources.json"];

// On Vercel the data dir is an empty /tmp folder, so copy the bundled
// source configs into it when they are missing.
async function ensureSeedFiles() {
  await mkdir(runtimeDataDir, { recursive: true });

  for (const file of seedFiles) {
    const target = path.join(runtimeDataDir, file);

    try {
      await access(target, constants.F_OK);
    } catch {
      try {
        await copyFile(path.join(process.cwd(), "data", file), target);
      } catch {
        // seed file not bundled; the script will report the missing config
      }
    }
  }
}

export async function runLocalScript(
  scriptPath: string,
  timeoutMs = 20 * 60 * 1000
): Promise<RunLocalScriptResult> {
  const isBlobScript =
    scriptPath.includes("blob-pull") ||
    scriptPath.includes("blob-push") ||
    scriptPath.includes("blob-sync");

  if (!isVercel || isBlobScript) {
    return runNodeScript(scriptPath, timeoutMs);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      code: null,
      stdout: "",
      stderr:
        "BLOB_READ_WRITE_TOKEN is not set. In Vercel, open Storage, create a Blob store and connect it to this project, then redeploy."
    };
  }

  const pull = await runNodeScript("scripts/blob-pull.mjs", 60 * 1000);

  if (!pull.ok) {
    return { ...pull, stderr: `Blob pull failed: ${pull.stderr || pull.stdout}`.trim() };
  }

  await ensureSeedFiles();

  const result = await runNodeScript(scriptPath, timeoutMs);

  const push = await runNodeScript("scripts/blob-push.mjs", 60 * 1000);

  if (!push.ok && result.ok) {
    return { ...push, stderr: `Blob push failed: ${push.stderr || push.stdout}`.trim() };
  }

  return result;
}
