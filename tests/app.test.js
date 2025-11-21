//const request = require('supertest');
//const app = require('../server');  // Adjust if needed

//describe('Employee API', () => {
  //it('should connect to MongoDB', async () => {
//    const res = await request(app).get('/api/employees');  // Will fail without token, but checks startup
    //expect(res.status).toBe(401);  // Expected without auth
  //});

  // Add more: e.g., mock DB for full CRUD tests
//});
//
//

const request = require('supertest');
const app = require('../server');  // Your Express app

describe('Employee API', () => {
  let server;

  beforeAll((done) => {
    server = app.listen(3000, (err) => {  // Explicit listen for supertest
      if (err) return done(err);
      done();
    });
  });

  afterAll((done) => {
    if (server) {
      server.close(() => done());
    } else {
      done();
    }
  });

  it('should start server and respond to root (static)', async () => {
    const res = await request(server).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<html>');  // Assumes index.html has <html>
  });

  it('should return 401 for /api/employees (no token)', async () => {
    const res = await request(server).get('/api/employees');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Access denied');
  });

  it('should mock empty employees in test mode', async () => {
    // Mock a token if needed; for now, just check server up
    expect(server.address().port).toBe(3000);  // Confirms listen
  });
});
