process.env.ATLAS_ENABLE_LOCAL_MODE = process.env.ATLAS_ENABLE_LOCAL_MODE || '1';
process.env.ATLAS_LOCAL_ADMIN_PASSWORD = process.env.ATLAS_LOCAL_ADMIN_PASSWORD || 'atlas-local';
process.env.PORT = process.env.PORT || '4173';
process.env.HOST = process.env.HOST || '127.0.0.1';

console.log('[qa-local] starting server with local mode enabled');
console.log(`[qa-local] host=${process.env.HOST} port=${process.env.PORT}`);
require('../../../server.js');
