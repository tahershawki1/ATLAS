import { json, requireUser } from "../../_utils";
import {
  buildFileId,
  fileContentType,
  normalizeWorkspaceId,
  readJsonObject,
  requireWorkspaceBucket,
  workspaceFileKey,
  workspaceStateKey,
  writeJsonObject,
} from "../_workspace_utils";

async function updateWorkspaceFiles(bucket, userId, workspaceId, fileRecord) {
  const stateKey = workspaceStateKey(userId, workspaceId);
  const workspace = await readJsonObject(bucket, stateKey, {
    id: workspaceId,
    pages: {},
    files: {},
    created_at: new Date().toISOString(),
  });
  workspace.files = { ...(workspace.files || {}), [fileRecord.id]: fileRecord };
  workspace.updated_at = new Date().toISOString();
  await writeJsonObject(bucket, stateKey, workspace);
}

export async function onRequestPost(context) {
  const auth = await requireUser(context);
  if (auth.error) return auth.error;

  const bucketResult = requireWorkspaceBucket(context.env);
  if (bucketResult.error) return bucketResult.error;

  const workspaceId = normalizeWorkspaceId(context.params.workspaceId);
  if (!workspaceId) return json({ error: "workspaceId is required" }, { status: 400 });

  const form = await context.request.formData();
  const file = form.get("file");
  if (!file || typeof file.stream !== "function") {
    return json({ error: "file is required" }, { status: 400 });
  }

  const pageKey = String(form.get("pageKey") || "").trim();
  const fieldKey = String(form.get("fieldKey") || "").trim();
  const fileId = buildFileId(file.name);
  const key = workspaceFileKey(auth.user.id, workspaceId, fileId);
  const contentType = fileContentType(file);

  await bucketResult.bucket.put(key, file.stream(), {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      user_id: auth.user.id,
      workspace_id: workspaceId,
      page_key: pageKey,
      field_key: fieldKey,
      file_name: file.name || "file",
    },
  });

  const fileRecord = {
    id: fileId,
    name: file.name || "file",
    size: file.size || 0,
    type: contentType,
    pageKey,
    fieldKey,
    updated_at: new Date().toISOString(),
    url: `/api/workspaces/${encodeURIComponent(workspaceId)}/files/${encodeURIComponent(fileId)}`,
  };
  await updateWorkspaceFiles(bucketResult.bucket, auth.user.id, workspaceId, fileRecord);

  return json({ ok: true, file: fileRecord }, { status: 201 });
}
