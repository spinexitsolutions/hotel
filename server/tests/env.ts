// Test environment — a dedicated database that is reset by the global setup.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'mongodb://localhost:27017/hotel_test?replicaSet=rs0&directConnection=true';
if (!/test/i.test(process.env.DATABASE_URL)) throw new Error('Tests must use a dedicated test database.');
process.env.SESSION_SECRET = 'test-session-secret-0123456789-abcdefghijkl';
process.env.PAYMENT_PROVIDER = 'sandbox';
process.env.SANDBOX_PAYMENT_SECRET = 'test-sandbox-secret-0123456789';
process.env.EMAIL_PROVIDER = 'log';
process.env.JOBS_ENABLED = 'false';
process.env.UPLOAD_DIR = 'tests/.uploads';
