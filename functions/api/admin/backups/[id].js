import { handleBackupId } from '../../../_lib/backup.js';
export async function onRequest(context) { return handleBackupId(context.request, context.env, context.params.id); }
export async function onRequestOptions(context) { return handleBackupId(context.request, context.env, context.params.id); }
