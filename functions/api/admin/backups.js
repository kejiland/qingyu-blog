import { handleBackups } from '../../_lib/backup.js';
export async function onRequest(context) { return handleBackups(context.request, context.env); }
export async function onRequestOptions(context) { return handleBackups(context.request, context.env); }
