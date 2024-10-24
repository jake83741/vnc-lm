export * from './client';
export * from './models';
export * from './types';

import { defaultClient, chatBot } from './client';
import { ModelManager } from './models';

export const defaultModelManager = new ModelManager();
export { defaultClient, chatBot };