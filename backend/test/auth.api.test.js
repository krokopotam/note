/**
 * Accounts: registration is open to anybody who reaches the site, login is the
 * ordinary one-password affair, and a session is a cookie the data endpoints insist on.
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { APPS, GAMES, GAMES_FOLDER, REMEMBER_DAYS, SESSION_HOURS, isGame } from '@note/shared';
import { authThrottle } from '../src/http/auth.js';
import { newSessionToken } from '../src/domain/tokens.js';
import { createSession } from '../src/repos/sessions.js';
import { findByUsername } from '../src/repos/users.js';
import { seedUser } from '../src/repos/seed.js';
import { makeSignedApp, makeTestApp, PASSWORD } from './helpers.js';

const setCookie = (res) => (res.headers['set-cookie'] ?? [])[0] ?? '';
/** Only name=value belongs in a Cookie header. */
const cookiePair = (res) => setCookie(res).split(';')[0];

describe('registration', () => {
  it('lets a stranger register and signs them straight in', async () => {
    const { app } = makeTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'Ala ', password: 'mojehaslo123', password_confirm: 'mojehaslo123' });

    expect(res.status).toBe(201);
    // Trimmed and lowercased on the way in, so 'Ala' and 'ala' cannot both exist.
    expect(res.body.user).toMatchObject({ username: 'ala' });
    expect(res.body.user.password_hash).toBeUndefined();

    const notes = await request(app).get('/api/notes').set('Cookie', cookiePair(res));
    expect(notes.status).toBe(200);
  });

  it('refuses the two passwords when they disagree', async () => {
    const { app, db } = makeTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ala', password: 'mojehaslo123', password_confirm: 'cośinnego123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_error');
    expect(res.body.error.details.map((detail) => detail.path)).toContain('password_confirm');
    // Nothing was created, so nothing can be logged into.
    expect(findByUsername(db, 'ala')).toBeUndefined();
  });

  it('refuses a password shorter than the rule', async () => {
    const { app } = makeTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ala', password: 'krótkie', password_confirm: 'krótkie' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/8 znak/);
  });

  it('refuses a login the shell could not store unambiguously', async () => {
    const { app } = makeTestApp();

    for (const username of ['al', 'a'.repeat(33), 'założ', 'has to be one', 'no spaces!']) {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username, password: 'długiehaslo1', password_confirm: 'długiehaslo1' });
      expect(res.status, username).toBe(400);
      expect(res.body.error.details.map((detail) => detail.path)).toContain('username');
    }
  });

  it('refuses a name that is taken, however it is typed', async () => {
    const { app } = makeTestApp();
    await request(app)
      .post('/api/auth/register')
      .send({ username: 'ala', password: PASSWORD, password_confirm: PASSWORD });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: ' ALA ', password: PASSWORD, password_confirm: PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('username_taken');
  });

  it('gives a new account a desktop it can actually use', async () => {
    // The production seeding, this time for real.
    const { app } = makeTestApp({ seed: seedUser });

    const registered = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ala', password: PASSWORD, password_confirm: PASSWORD });
    const agent = request.agent(app).set('Cookie', cookiePair(registered));

    const items = (await agent.get('/api/desktop/items')).body.items;
    expect(items.map((item) => item.app_id)).toEqual(expect.arrayContaining(APPS.map((a) => a.id)));

    // Gierek nie ma na paskach — leżą w osobnym folderze, żeby nie zagradzać pulpitu.
    const games = items.find((item) => item.kind === 'folder' && item.name === GAMES_FOLDER);
    expect(games).toBeTruthy();
    expect(
      items.filter((item) => item.parent_id === games.id).map((item) => item.app_id),
    ).toEqual(expect.arrayContaining(GAMES.map((game) => game.id)));

    const favorites = (await agent.get('/api/desktop/favorites')).body.slots;
    expect(favorites.find((slot) => slot.slot === 'dock').app_ids).toEqual(
      APPS.filter((app) => !isGame(app.id)).map((app) => app.id),
    );

    // ...and something to open, otherwise the first screen is a blank desk.
    expect((await agent.get('/api/notes')).body.total).toBeGreaterThan(0);
  });
});

describe('login', () => {
  async function registered(app, username = 'ala') {
    return request(app)
      .post('/api/auth/register')
      .send({ username, password: PASSWORD, password_confirm: PASSWORD });
  }

  it('signs an existing user in with one password', async () => {
    const { app } = makeTestApp();
    await registered(app);

    const res = await request(app).post('/api/auth/login').send({ username: 'ala', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('ala');
    expect(res.body.user.last_login_at).toBeTruthy();

    const me = await request(app).get('/api/auth/me').set('Cookie', cookiePair(res));
    expect(me.body.user.username).toBe('ala');
  });

  it('answers the same way for a wrong password and a stranger', async () => {
    const { app } = makeTestApp();
    await registered(app);

    const wrong = await request(app).post('/api/auth/login').send({ username: 'ala', password: 'obcehaslo123' });
    const ghost = await request(app).post('/api/auth/login').send({ username: 'ktoś', password: 'obcehaslo123' });

    expect(wrong.status).toBe(401);
    expect(ghost.status).toBe(401);
    // Same code and message: the form must not confirm which logins exist.
    expect(ghost.body).toEqual(wrong.body);
    expect(wrong.body.error.code).toBe('invalid_credentials');
  });

  it('will not sign into an account whose password nobody set', async () => {
    const { app, db } = makeTestApp();
    expect(findByUsername(db, 'wincyj')).toBeTruthy(); // created by the migration

    const res = await request(app).post('/api/auth/login').send({ username: 'wincyj', password: PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_credentials');
  });

  it('gives "10 days" a cookie that outlives the browser', async () => {
    const { app, db } = makeTestApp();
    await registered(app);

    const remembered = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ala', password: PASSWORD, remember: true });

    expect(setCookie(remembered)).toContain(`Max-Age=${REMEMBER_DAYS * 24 * 60 * 60}`);
    const row = db.prepare('SELECT expires_at, remember FROM sessions ORDER BY id DESC LIMIT 1').get();
    expect(row.remember).toBe(1);
    const days = (new Date(row.expires_at) - new Date()) / 86_400_000;
    expect(days).toBeGreaterThan(REMEMBER_DAYS - 1);
    expect(days).toBeLessThanOrEqual(REMEMBER_DAYS);
  });

  it('keeps an ordinary session short and browser-sized', async () => {
    const { app, db } = makeTestApp();
    await registered(app);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ala', password: PASSWORD, remember: false });

    // No Max-Age: the cookie dies with the browser, the row dies after SESSION_HOURS.
    expect(setCookie(res)).not.toContain('Max-Age');
    const row = db.prepare('SELECT expires_at, remember FROM sessions ORDER BY id DESC LIMIT 1').get();
    expect(row.remember).toBe(0);
    const hours = (new Date(row.expires_at) - new Date()) / 3_600_000;
    expect(hours).toBeGreaterThan(SESSION_HOURS - 1);
    expect(hours).toBeLessThanOrEqual(SESSION_HOURS);
  });

  it('marks the cookie so no script or other site can use it', async () => {
    const { app } = makeTestApp();

    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ala', password: PASSWORD, password_confirm: PASSWORD });

    const header = setCookie(res);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Path=/');
    expect(header.startsWith('note_session=')).toBe(true);
  });
});

describe('sessions', () => {
  it('refuses anonymous visitors on everything but health', async () => {
    const { app } = makeTestApp();

    expect((await request(app).get('/api/health')).status).toBe(200);

    for (const path of ['/api/notes', '/api/stickies', '/api/desktop/items', '/api/session/notepad', '/api/auth/me']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
      expect(res.body.error.code).toBe('unauthorized');
    }

    expect((await request(app).post('/api/notes').send({ body: 'x' })).status).toBe(401);
  });

  it('treats a forged cookie as no cookie at all', async () => {
    const { app } = makeTestApp();

    const res = await request(app).get('/api/notes').set('Cookie', 'note_session=nie-ten-token');
    expect(res.status).toBe(401);
  });

  it('rejects and forgets a session that ran out', async () => {
    const { app, db, user } = await makeSignedApp();
    const token = newSessionToken();
    createSession(db, {
      userId: user.id,
      token,
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    const res = await request(app).get('/api/notes').set('Cookie', `note_session=${token}`);

    expect(res.status).toBe(401);
    // The dead row is gone; the one from sign-up is still alive.
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at <= ?').get(new Date().toISOString()).n).toBe(0);
  });

  it('logs out and takes the cookie with it', async () => {
    const { agent, app } = await makeSignedApp();

    expect((await agent.get('/api/auth/me')).status).toBe(200);
    const out = await agent.post('/api/auth/logout');
    expect(out.status).toBe(204);
    expect(setCookie(out)).toContain('Max-Age=0');

    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('says 204 to an anonymous logout too', async () => {
    const { app } = makeTestApp();
    expect((await request(app).post('/api/auth/logout')).status).toBe(204);
  });

  it('stops a password-guessing run', async () => {
    const { app } = makeTestApp({ throttle: authThrottle({ max: 3, windowMs: 60_000 }) });

    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app).post('/api/auth/login').send({ username: 'ala', password: 'zgad12345' }),
      ),
    );

    expect(attempts.filter((res) => res.status === 429)).toHaveLength(2);
    const blocked = attempts.find((res) => res.status === 429);
    expect(blocked.body.error.code).toBe('too_many_attempts');
    expect(blocked.headers['retry-after']).toBeTruthy();
  });
});
