if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:memorydb?schema=public';
}

if (!process.env.APP_URL) {
  process.env.APP_URL = 'http://localhost:3001';
}

if (!process.env.APP_NAME) {
  process.env.APP_NAME = 'My Race Engineer (Test)';
}

if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = '12345678901234567890123456789012';
}
