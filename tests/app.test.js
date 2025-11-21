const request = require('supertest');
const app = require('../server');

describe('Employee API', () => {
  let server;

  beforeAll((done) => {
    process.env.TEST_RUNNING = 'true';  // Flag for log suppression
    server = app.listen(3000, (err) => {
      if (err) return done(err);
      done();
    });
  });

  afterAll((done) => {
    delete process.env.TEST_RUNNING;  // Cleanup
    if (server) {
      server.close(done);
    } else {
      done();
    }
  });

  it('should respond to root (static)', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html>');  // Adjust if no <html> in index.html
  });

  it('should return 401 for /api/employees (no token)', async () => {
    const res = await request(server).get('/api/employees');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Access denied');
  });

  it('should mock empty employees in test mode', async () => {
    expect(global.mockDB).toBe(true);
    const res = await request(server).get('/api/employees');
    expect(res.body.employees).toEqual([]);  // Mock response
  });
});
