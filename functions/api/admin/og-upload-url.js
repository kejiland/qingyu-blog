import { handleOgUploadUrl } from '../_lib/og.js';
export async function onRequest(context) { return handleOgUploadUrl(context.request, context.env); }
export async function onRequestOptions(context) { return handleOgUploadUrl(context.request, context.env); }
