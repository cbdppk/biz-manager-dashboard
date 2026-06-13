import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);

function createSelectChain(resultByValue) {
  const resolve = (value) => (typeof resultByValue === 'function' ? resultByValue(value) : resultByValue);

  return {
    eq(_column, value) {
      return {
        maybeSingle: async () => resolve(value),
        single: async () => resolve(value),
      };
    },
    ilike(_column, value) {
      return {
        maybeSingle: async () => resolve(value),
        single: async () => resolve(value),
      };
    },
  };
}

async function makeAuthApp() {
  vi.resetModules();
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'supabase-test-key';
  process.env.JWT_SECRET = 'jwt-test-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
  const seededPasswordHash = await bcrypt.hash('DemoPass123!', 4);

  const state = {
    insertedBusiness: null,
    insertedUser: null,
    updatedUser: null,
    tokenVersion: 0,
  };

  const supabase = {
    from: vi.fn((table) => {
    if (table === 'audit_logs') {
      return {
        insert: async () => ({ error: null }),
      };
    }

    if (table === 'users') {
      return {
        select(fields, options) {
          if (options?.head) {
            return {
              eq() {
                return {
                  eq: async () => ({ count: 1 }),
                };
              },
            };
          }
          if (fields === 'id') {
            return createSelectChain({ data: null, error: null });
          }

          if (fields === 'password_hash' || fields.includes('password_hash')) {
            return createSelectChain((emailOrId) => {
              if (emailOrId === 'owner@demo.example.com' || emailOrId === 'seeded-owner-id') {
                return {
                  data: {
                    id: 'seeded-owner-id',
                    business_id: 'seeded-business-id',
                    role: 'owner',
                    is_active: true,
                    password_hash: seededPasswordHash,
                    token_version: state.tokenVersion,
                    must_change_password: false,
                  },
                  error: null,
                };
              }

              return { data: null, error: { message: 'not found' } };
            });
          }

          if (fields.includes('role') && fields.includes('is_active')) {
            return createSelectChain((userId) => {
              if (userId === 'seeded-owner-id') {
                return {
                  data: {
                    id: 'seeded-owner-id',
                    business_id: 'seeded-business-id',
                    role: 'owner',
                    is_active: true,
                    token_version: state.tokenVersion,
                  },
                  error: null,
                };
              }

              return { data: null, error: { message: 'not found' } };
            });
          }

          if (fields.includes('must_change_password')) {
            return createSelectChain({
              data: { email: 'owner@demo.example.com', must_change_password: false },
              error: null,
            });
          }

          return createSelectChain({ data: null, error: null });
        },
        insert(payload) {
          state.insertedUser = payload;
          return Promise.resolve({ error: null });
        },
        update(payload) {
          state.updatedUser = { ...(state.updatedUser || {}), ...payload };
          if (payload.token_version !== undefined) {
            state.tokenVersion = payload.token_version;
          }
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    }

    if (table === 'businesses') {
      return {
        insert(payload) {
          state.insertedBusiness = payload;
          return Promise.resolve({ error: null });
        },
        select() {
          return createSelectChain({
            data: {
              id: 'seeded-business-id',
              name: 'Sample Ventures Demo',
              sector: 'retail',
              operating_mode: 'retail',
              enabled_modules: ['retail_core'],
            },
            error: null,
          });
        },
        delete() {
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    }

    throw new Error(`Unhandled table mock: ${table}`);
    }),
  };

  const supabasePath = require.resolve('../src/config/supabase.js');
  const authPath = require.resolve('../src/routes/auth.js');
  const authMiddlewarePath = require.resolve('../src/middleware/auth.js');
  delete require.cache[supabasePath];
  delete require.cache[authPath];
  delete require.cache[authMiddlewarePath];
  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: supabase,
  };

  const authRoutes = require('../src/routes/auth.js');

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  return { app, state };
}

describe('auth routes', () => {
  it('logs in seeded users with the custom password hash', async () => {
    const { app } = await makeAuthApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@demo.example.com', password: 'DemoPass123!' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.business_name).toBe('Sample Ventures Demo');
  });

  it('rejects seeded login attempts with the wrong password', async () => {
    const { app } = await makeAuthApp();

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'owner@demo.example.com', password: 'wrong-password' });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid email or password.');
  });

  it('creates accounts with a hashed password and returns a JWT', async () => {
    const { app, state } = await makeAuthApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({
        business_name: 'Test Shop',
        owner_name: 'Test Owner',
        email: 'owner@testshop.example',
        phone: '0000000999',
        password: 'NewPassword123!',
        sector: 'retail',
      });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTypeOf('string');
    expect(state.insertedBusiness.name).toBe('Test Shop');
    expect(state.insertedUser.email).toBe('owner@testshop.example');
    expect(state.insertedUser.password_hash).not.toBe('NewPassword123!');
    await expect(bcrypt.compare('NewPassword123!', state.insertedUser.password_hash)).resolves.toBe(true);
  }, 15000);

  it('returns 503 when staff invite email is not configured', async () => {
    const { app, state } = await makeAuthApp();
    const token = jwt.sign({ userId: 'seeded-owner-id', tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const response = await request(app)
      .post('/api/auth/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'cashier@testshop.example', role: 'cashier' });

    expect(response.status).toBe(503);
    expect(response.body.error).toContain('RESEND_API_KEY');
    expect(response.body.temporary_password).toBeUndefined();
    expect(state.insertedUser).toBeNull();
  }, 15000);

  it('rejects old tokens after password change and accepts the new token', async () => {
    const { app, state } = await makeAuthApp();
    const oldToken = jwt.sign({ userId: 'seeded-owner-id', tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const changeResponse = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldToken}`)
      .send({ current_password: 'DemoPass123!', new_password: 'NewPassword456!' });

    expect(changeResponse.status).toBe(200);
    expect(changeResponse.body.token).toBeTypeOf('string');
    expect(state.updatedUser?.token_version).toBe(1);

    const staleMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(staleMe.status).toBe(401);

    const freshMe = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${changeResponse.body.token}`);

    expect(freshMe.status).toBe(200);
  }, 15000);
});
