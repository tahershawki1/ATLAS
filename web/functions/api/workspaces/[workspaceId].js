import { json, requireUser } from "../_utils";
import {
  normalizeWorkspaceId,
  readManifest,
  readJsonObject,
  requireWorkspaceBucket,
  upsertWorkspaceManifest,
  workspaceFilesPrefix,
  workspaceStateKey,
  writeManifest,
  writeJsonObject,
} from "./_workspace_utils";

function emptyWorkspace(workspaceId) {
  return {
    id: workspaceId,
    pages: {},
    files: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function readWorkspace(bucket, userId, workspaceId) {
  return readJsonObject(bucket, workspaceStateKey(userId, workspaceId), emptyWorkspace(workspaceId));
}

async function writeWorkspace(bucket, userId, workspaceId, workspace) {
  const now = new Date().toISOString();
  const next = {
    ...workspace,
    id: workspaceId,
    user_id: userId,
    pages: workspace?.pages && typeof workspace.pages === "object" ? workspace.pages : {},
    files: workspace?.files && typeof workspace.files === "object" ? workspace.files : {},
    created_at: workspace?.created_at || now,
    updated_at: now,
  };
  await writeJsonObject(bucket, workspaceStateKey(userId, workspaceId), next);
  await upsertWorkspaceManifest(bucket, userId, {
    id: workspaceId,
    title: next.title || next.workspace_title || next.meta?.title,
    created_at: next.created_at,
    meta: next.meta || {},
  });
  return next;
}

export async function onRequestGet(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, { status: 400 });

  const workspace = await readWorkspace(bucketResult.bucket, auth.user.id, workspaceId);
  return json({ workspace });
}

export async function onRequestPut(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, { status: 400 });

  const payload = await context.request.json();
  const workspace = await writeWorkspace(bucketResult.bucket, auth.user.id, workspaceId, {
    ...payload?.workspace,
    id: workspaceId,
  });
  return json({ ok: true, workspace });
}

export async function onRequestPatch(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, { status: 400 });

  const payload = await context.request.json();
  const workspace = await readWorkspace(bucketResult.bucket, auth.user.id, workspaceId);
  workspace.title = payload?.title || workspace.title;
  workspace.meta = { ...(workspace.meta || {}), ...(payload?.meta || {}) };

  if (payload?.pageKey) {
    workspace.pages = workspace.pages || {};
    workspace.pages[payload.pageKey] = {
      ...(workspace.pages[payload.pageKey] || {}),
      ...(payload.state || {}),
      updated_at: new Date().toISOString(),
    };
  }

  if (payload?.files && typeof payload.files === "object") {
    workspace.files = { ...(workspace.files || {}), ...payload.files };
  }

  const saved = await writeWorkspace(bucketResult.bucket, auth.user.id, workspaceId, workspace);
  return json({ ok: true, workspace: saved });
}

export async function onRequestDelete(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, { status: 400 });

  const prefix = workspaceFilesPrefix(auth.user.id, workspaceId);
  const listed = await bucketResult.bucket.list({ prefix });
  await Promise.all((listed.objects || []).map((object) => bucketResult.bucket.delete(object.key)));
  await bucketResult.bucket.delete(workspaceStateKey(auth.user.id, workspaceId));
  const manifest = await readManifest(bucketResult.bucket, auth.user.id);
  manifest.workspaces = manifest.workspaces.filter((entry) => String(entry?.id) !== workspaceId);
  await writeManifest(bucketResult.bucket, auth.user.id, manifest);
  return json({ ok: true });
}
