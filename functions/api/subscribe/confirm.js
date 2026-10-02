import { handleSubscribeConfirm } from '../../_lib/subscribe.js';
export async function onRequest(context) { return handleSubscribeConfirm(context.request, context.env); }
