import { json } from "../_utils";

const WORKSPACE_PREFIX = "workspace-store/v1";

function getWorkspaceBucket(env) {
  return env?.ATLAS_WORKSPACE_BUCKET || env?.ATLAS_PAGES_BUCKET || null;
}

function keySegment(value) {
  return encodeURIComponent(String(value || "").trim() || "default");
}

function normalizeWorkspaceId(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .join("-")
    .slice(0, 160);
}

function userRoot(userId) {
  return `${WORKSPACE_PREFIX}/users/${keySegment(userId)}`;
}

function manifestKey(userId) {
  return `${userRoot(userId)}/manifest.json`;
}

function workspaceRoot(userId, workspaceId) {
  return `${userRoot(userId)}/workspaces/${keySegment(normalizeWorkspaceId(workspaceId))}`;
}

function workspaceStateKey(userId, workspaceId) {
  return `${workspaceRoot(userId, workspaceId)}/state.json`;
}

function workspaceFilesPrefix(userId, workspaceId) {
  return `${workspaceRoot(userId, workspaceId)}/files`;
}

function workspaceFileKey(userId, workspaceId, fileId) {
  return `${workspaceFilesPrefix(userId, workspaceId)}/${keySegment(fileId)}`;
}

function requireWorkspaceBucket(env) {
  const bucket = getWorkspaceBucket(env);
  if (!bucket) {
    return {
      error: json({ error: "ATLAS_WORKSPACE_BUCKET or ATLAS_PAGES_BUCKET binding is required" }, { status: 500 }),
    };
  }
  return { bucket };
}

async function readJsonObject(bucket, key, fallback) {
  const object = await bucket.get(key);
  if (!object) return fallback;
  try {
    return await object.json();
  } catch (_) {
    return fallback;
  }
}

async function writeJsonObject(bucket, key, value) {
  await bucket.put(key, JSON.stringify(value), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });
  return value;
}

async function readManifest(bucket, userId) {
  const manifest = await readJsonObject(bucket, manifestKey(userId), { workspaces: [] });
  return {
    workspaces: Array.isArray(manifest?.workspaces) ? manifest.workspaces : [],
  };
}

async function writeManifest(bucket, userId, manifest) {
  const next = {
    workspaces: Array.isArray(manifest?.workspaces) ? manifest.workspaces : [],
    updated_at: new Date().toISOString(),
  };
  return writeJsonObject(bucket, manifestKey(userId), next);
}

async function upsertWorkspaceManifest(bucket, userId, workspace) {
  const now = new Date().toISOString();
  const manifest = await readManifest(bucket, userId);
  const id = normalizeWorkspaceId(workspace?.id || workspace?.workspace_id);
  if (!id) return manifest;

  const record = {
    id,
    title: String(workspace?.title || workspace?.workspace_title || workspace?.project_name || id),
    updated_at: now,
    created_at: workspace?.created_at || now,
    meta: workspace?.meta || {},
  };

  manifest.workspaces = [
    record,
    ...manifest.workspaces.filter((entry) => String(entry?.id) !== id),
  ].slice(0, 100);

  await writeManifest(bucket, userId, manifest);
  return manifest;
}

function fileContentType(file, fallbackPath = "") {
  if (file?.type) return file.type;
  const lower = String(file?.name || fallbackPath || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (lower.endsWith(".sdr") || lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function buildFileId(fileName = "file") {
  const safeName = String(fileName || "file")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "file";
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;
}

export {
  buildFileId,
  fileContentType,
  normalizeWorkspaceId,
  readJsonObject,
  readManifest,
  requireWorkspaceBucket,
  upsertWorkspaceManifest,
  workspaceFileKey,
  workspaceFilesPrefix,
  workspaceStateKey,
  writeJsonObject,
  writeManifest,
};
