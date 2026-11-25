'use strict';

/**
 * clubs.js — REST API for clubs (#178). Rules live in ClubService.
 *
 * GET    /api/clubs?q=&page=            discover list (public)
 * POST   /api/clubs                     create
 * GET    /api/clubs/mine                my clubs
 * GET    /api/clubs/:slug?category=     club page + member leaderboard (public)
 * PUT    /api/clubs/:slug               edit description / join policy
 * DELETE /api/clubs/:slug               delete (owner)
 * POST   /api/clubs/:slug/join | /leave
 * POST   /api/clubs/:slug/members/:username/approve
 * DELETE /api/clubs/:slug/members/:username        reject request / kick
 * PUT    /api/clubs/:slug/members/:username/role   {role: officer|member|owner}
 * POST   /api/clubs/:slug/invites/:username      staff invite (invitee joins without approval)
 * DELETE /api/clubs/:slug/invites/:username      staff revoke
 * POST   /api/clubs/:slug/events                   {title, startsAt} staff
 * DELETE /api/clubs/:slug/events/:id                staff
 * POST   /api/clubs/:slug/events/:id/rsvp           members: "tham gia" (B450) → {id, going, mine}
 * DELETE /api/clubs/:slug/events/:id/rsvp           members: take it back
 * GET    /api/clubs/:slug/messages?before=|after=[&polls=1,2]   members only (polling; polls = refresh those cards, B449)
 * POST   /api/clubs/:slug/messages                  {text} members only; /ghim, /giaohuu, /binhchon, @mentions (B447)
 * DELETE /api/clubs/:slug/messages/:id              staff
 * POST   /api/clubs/:slug/messages/:id/vote         {option: 0-based | null} members (B449)
 * POST   /api/clubs/:slug/messages/:id/close        poll creator or staff
 * GET    /api/clubs/:slug/messages/:id/voters       members: names per option
 * GET    /api/clubs/:slug/avatar | /banner         image (immutable; URL carries ?v=)
 * POST   /api/clubs/:slug/avatar | /banner         raw image body, staff (#250) — DELETE removes
 */

const fs = require('fs');
const express = require('express');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { optionalUserId } = require('../utils/optional-user');
const { verifyToken } = require('../middleware/auth');
const { rejectGuests } = require('../middleware/guest-guard');
const { CATEGORIES } = require('../managers/RatingService');
const svc = require('../managers/ClubService');
const { CLUB_IMAGE_DIR, KINDS, imageFile } = require('../utils/club-image-store');

const router = express.Router();
const keyGenerator = (req) => ipKeyGenerator(getClientIpFromReq(req) || '');
router.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300, keyGenerator }));
const writeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 120, keyGenerator });

const write = [verifyToken, rejectGuests('Khách không dùng được nhóm.'), writeLimiter, express.json({ limit: '4kb' })];

/** Wrap a handler: ClubError → its status/code, anything else → errorHandler. */
const h = (fn) => (req, res, next) => {
  try {
    fn(req, res);
  } catch (err) {
    if (err instanceof svc.ClubError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
};

const category = (req) => (CATEGORIES.includes(req.query.category) ? req.query.category : CATEGORIES[0]);

router.get('/', h((req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 30) : '';
  const { total, clubs } = svc.listClubs({ q, page, limit, category: category(req) });
  res.json({ clubs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

router.post('/', ...write, h((req, res) => {
  res.status(201).json(svc.createClub(req.user.userId, req.body || {}));
}));

router.get('/mine', verifyToken, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ clubs: req.user.userId ? svc.clubsOfUser(req.user.userId, true) : [] });
}));

router.param('slug', (req, res, next, slug) => {
  try {
    const club = svc.getClub(slug);
    const write = !['GET', 'HEAD'].includes(req.method) && !(req.method === 'POST' && ['/:slug/messages/:id/report', '/:slug/leave'].includes(req.route?.path));
    svc.checkAccess(club, club.hidden ? optionalUserId(req) : null, write);
    next();
  } catch (err) {
    if (err instanceof svc.ClubError) return res.status(err.status).json({ code: err.code, error: err.message });
    next(err);
  }
});

// Avatar + banner (#250). Never stored as uploaded: sharp decodes, rotates, cover-crops to the kind's size and
// re-encodes to WebP (no EXIF/polyglots). Staff only; the file is overwritten in place, the URL carries ?v=.
const IMAGE_MAX_INPUT = 2 * 1024 * 1024;
const MAX_INPUT_PIXELS = 24e6;
const IMAGE_QUALITY_STEPS = [80, 65, 50, 35, 25];
const imageAuth = write.slice(0, 3); // everything but express.json

for (const [kind, spec] of Object.entries(KINDS)) {
  router.get(`/:slug/${kind}`, h((req, res) => {
    const club = svc.getClub(req.params.slug);
    const file = imageFile(club.id, kind);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Chưa có ảnh.', code: 'CLUB_IMAGE_NONE' });
    res.set('Cache-Control', club.hidden ? 'private, no-store' : 'public, max-age=31536000, immutable');
    res.type('image/webp').sendFile(file);
  }));

  router.post(`/:slug/${kind}`, ...imageAuth, express.raw({ type: () => true, limit: IMAGE_MAX_INPUT }), async (req, res, next) => {
    try {
      const club = svc.clubForImageEdit(req.user.userId, req.params.slug);
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Thiếu ảnh.', code: 'CLUB_IMAGE_EMPTY' });
      }
      let out;
      try {
        const img = sharp(req.body, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' });
        const meta = await img.metadata();
        if (!['jpeg', 'png', 'webp'].includes(meta.format)) {
          return res.status(415).json({ error: 'Chỉ nhận ảnh JPEG, PNG hoặc WebP.', code: 'CLUB_IMAGE_TYPE' });
        }
        const base = img.rotate().resize(spec.w, spec.h, { fit: 'cover' });
        for (const quality of IMAGE_QUALITY_STEPS) {
          out = await base.clone().webp({ quality }).toBuffer();
          if (out.length <= spec.maxBytes) break;
        }
      } catch (_) {
        return res.status(415).json({ error: 'Ảnh không hợp lệ.', code: 'CLUB_IMAGE_INVALID' });
      }
      svc.clubForImageEdit(req.user.userId, req.params.slug);
      svc.checkAccess(svc.getClub(req.params.slug), req.user.userId, true);
      fs.mkdirSync(CLUB_IMAGE_DIR, { recursive: true });
      const target = imageFile(club.id, kind);
      const tmp = `${target}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, out);
      fs.renameSync(tmp, target);
      res.json({ url: svc.setImageVersion(club, kind, false), bytes: out.length });
    } catch (err) {
      if (err instanceof svc.ClubError) return res.status(err.status).json({ error: err.message, code: err.code });
      next(err);
    }
  });

  router.delete(`/:slug/${kind}`, ...write, h((req, res) => {
    const club = svc.clubForImageEdit(req.user.userId, req.params.slug);
    fs.rmSync(imageFile(club.id, kind), { force: true });
    res.json({ url: svc.setImageVersion(club, kind, true) });
  }));
}

router.get('/:slug', h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(svc.getClubDetail(req.params.slug, optionalUserId(req), req.query.category));
}));

router.put('/:slug', ...write, h((req, res) => {
  svc.updateClub(req.user.userId, req.params.slug, req.body || {});
  res.json({ ok: true });
}));

router.delete('/:slug', ...write, h((req, res) => {
  svc.deleteClub(req.user.userId, req.params.slug);
  res.json({ ok: true });
}));

router.post('/:slug/join', ...write, h((req, res) => {
  res.json({ role: svc.join(req.user.userId, req.params.slug) });
}));

router.post('/:slug/leave', ...write, h((req, res) => {
  svc.leave(req.user.userId, req.params.slug);
  res.json({ ok: true });
}));

function target(req) {
  const id = svc.userIdByUsername(req.params.username);
  if (!id) throw new svc.ClubError('CLUB_NOT_MEMBER', 404, 'Không tìm thấy người chơi.');
  return id;
}

router.post('/:slug/members/:username/approve', ...write, h((req, res) => {
  svc.approve(req.user.userId, req.params.slug, target(req));
  res.json({ ok: true });
}));

router.delete('/:slug/members/:username', ...write, h((req, res) => {
  svc.remove(req.user.userId, req.params.slug, target(req));
  res.json({ ok: true });
}));

router.put('/:slug/members/:username/role', ...write, h((req, res) => {
  svc.setRole(req.user.userId, req.params.slug, target(req), (req.body || {}).role);
  res.json({ ok: true });
}));

router.post('/:slug/invites/:username', ...write, h((req, res) => {
  svc.invite(req.user.userId, req.params.slug, target(req));
  res.status(201).json({ ok: true });
}));

router.delete('/:slug/invites/:username', ...write, h((req, res) => {
  svc.revokeInvite(req.user.userId, req.params.slug, target(req));
  res.json({ ok: true });
}));

router.post('/:slug/moderation', ...write, h((req, res) => {
  res.json(svc.moderate(req.user.userId, req.params.slug, req.body || {}));
}));

router.post('/:slug/polls', ...write, h((req, res) => {
  res.status(201).json(svc.createPoll(req.user.userId, req.params.slug, req.body || {}));
}));

router.post('/:slug/events', ...write, h((req, res) => {
  res.status(201).json(svc.createEvent(req.user.userId, req.params.slug, req.body || {}));
}));

router.delete('/:slug/events/:id', ...write, h((req, res) => {
  svc.deleteEvent(req.user.userId, req.params.slug, req.params.id);
  res.json({ ok: true });
}));

router.post('/:slug/events/:id/rsvp', ...write, h((req, res) => {
  res.json(svc.rsvpEvent(req.user.userId, req.params.slug, req.params.id, true));
}));

router.delete('/:slug/events/:id/rsvp', ...write, h((req, res) => {
  res.json(svc.rsvpEvent(req.user.userId, req.params.slug, req.params.id, false));
}));

const readAuth = [verifyToken, (req, res, next) => {
  if (!req.user.userId) return res.status(403).json({ error: 'Khách không dùng được nhóm.', code: 'GUEST_FORBIDDEN' });
  next();
}];

router.get('/:slug/messages', ...readAuth, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  const body = { messages: svc.listMessages(req.user.userId, req.params.slug, req.query) };
  if (req.query.visible) body.removed = svc.removedMessages(req.user.userId, req.params.slug, req.query.visible);
  if (req.query.polls) body.polls = svc.refreshPolls(req.user.userId, req.params.slug, req.query.polls);
  res.json(body);
}));

router.post('/:slug/messages', ...write, h((req, res) => {
  res.status(201).json(svc.postMessage(req.user.userId, req.params.slug, (req.body || {}).text));
}));

router.delete('/:slug/messages/:id', ...write, h((req, res) => {
  svc.deleteMessage(req.user.userId, req.params.slug, req.params.id);
  res.json({ ok: true });
}));

router.post('/:slug/messages/:id/report', ...write, h((req, res) => {
  svc.reportMessage(req.user.userId, req.params.slug, req.params.id, req.body?.reason);
  res.json({ ok: true });
}));

router.post('/:slug/messages/:id/vote', ...write, h((req, res) => {
  const option = (req.body || {}).option;
  res.json({ poll: svc.votePoll(req.user.userId, req.params.slug, req.params.id, option === undefined ? NaN : option) });
}));

router.post('/:slug/messages/:id/close', ...write, h((req, res) => {
  res.json({ poll: svc.closePoll(req.user.userId, req.params.slug, req.params.id) });
}));

router.get('/:slug/messages/:id/voters', ...readAuth, h((req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ voters: svc.pollVoters(req.user.userId, req.params.slug, req.params.id) });
}));

module.exports = router;
