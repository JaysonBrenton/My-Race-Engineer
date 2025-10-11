import { createImportPlanRouteHandlers } from './handlers';

const handlers = createImportPlanRouteHandlers();

export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
