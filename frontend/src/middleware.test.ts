import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function createToken(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
}

describe('frontend middleware', () => {
  it('redirects unauthenticated users away from protected routes', () => {
    const request = new NextRequest('http://localhost:3000/products');
    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fproducts');
  });

  it('redirects authenticated users away from auth pages', () => {
    const token = createToken(Math.floor(Date.now() / 1000) + 3600);
    const request = new NextRequest('http://localhost:3000/login', {
      headers: {
        cookie: `bm_token=${token}`,
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/dashboard');
  });

  it('clears expired cookies and redirects back to login', () => {
    const token = createToken(Math.floor(Date.now() / 1000) - 60);
    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: {
        cookie: `bm_token=${token}`,
      },
    });

    const response = middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost:3000/login?next=%2Fdashboard');
    expect(response.headers.get('set-cookie')).toContain('bm_token=');
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
