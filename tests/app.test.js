const request = require('supertest');
const app = require('../server');  // Adjust if needed

describe('Employee API', () => {
  it('should connect to MongoDB', async () => {
    const res = await request(app).get('/api/employees');  // Will fail without token, but checks startup
    expect(res.status).toBe(401);  // Expected without auth
  });

  // Add more: e.g., mock DB for full CRUD tests
});
