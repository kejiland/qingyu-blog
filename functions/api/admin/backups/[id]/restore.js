import { handleBackupRestore } from '../../../../_lib/backup.js';
export async function onRequest(context) { return handleBackupRestore(context.request, context.env, context.params.id); }
export async function onRequestOptions(context) { return handleBackupRestore(context.request, context.env, context.params.id); }
