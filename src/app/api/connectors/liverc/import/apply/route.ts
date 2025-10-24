// No React types in server routes by design.

import { createImportApplyRouteHandlers } from './handlers';

const handlers = createImportApplyRouteHandlers();

export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
