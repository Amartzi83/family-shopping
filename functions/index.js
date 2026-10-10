'use strict';

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://family-shopping-9f8a6-default-rtdb.firebaseio.com',
});

const SITE_URL = 'https://Amartzi83.github.io/family-shopping';

// ── Date helpers ──────────────────────────────────────────
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function israelDateStr(utcMs) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(utcMs));
}

function israelOffsetMs(date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const ilStr  = date.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
  return new Date(ilStr) - new Date(utcStr);
}

function occursOn(ev, dateString) {
  if (dateString < ev.date) return false;
  if (ev.endDate && dateString > ev.endDate) return false;
  if (!ev.repeat || ev.repeat === 'none') return ev.date === dateString;
  if (ev.repeat === 'range' || ev.repeat === 'daily') return true;

  const base   = parseDate(ev.date);
  const target = parseDate(dateString);
  const diff   = Math.round((target - base) / 86400000);

  if (ev.repeat === 'weekly')  return diff % 7 === 0;
  if (ev.repeat === 'monthly') return base.getDate() === target.getDate();
  if (ev.repeat === 'custom')  return diff % (ev.customDays || 7) === 0;
  return false;
}

async function checkReminders() {
  const db        = admin.database();
  const messaging = admin.messaging();
  const now       = Date.now();

  const windowStart = now - 30 * 1000;
  const windowEnd   = now + 5 * 60 * 1000;

  const [eventsSnap, tokensSnap, sentSnap] = await Promise.all([
    db.ref('calendar/events').once('value'),
    db.ref('fcm_tokens').once('value'),
    db.ref('sent_notifs').once('value'),
  ]);

  const events     = eventsSnap.val()  || {};
  const allTokens  = tokensSnap.val()  || {};
  const sentNotifs = sentSnap.val()    || {};

  const newSent  = {};
  const promises = [];

  const checkDates = [israelDateStr(now), israelDateStr(now + 86400000)];

  for (const [evKey, ev] of Object.entries(events)) {
    if (ev.allDay || !ev.time || !ev.members) continue;

    for (const dateString of checkDates) {
      if (!occursOn(ev, dateString)) continue;

      const [h, m] = ev.time.split(':').map(Number);
      const evDt   = parseDate(dateString);
      evDt.setHours(h, m, 0, 0);
      const offset  = israelOffsetMs(evDt);
      const baseUtc = evDt.getTime() - offset;

      const advArr = Array.isArray(ev.advanceMins)
        ? ev.advanceMins
        : [typeof ev.advanceMins === 'number' ? ev.advanceMins : 0];

      for (const adv of advArr) {
        const fireAt = baseUtc - adv * 60000;
        if (fireAt < windowStart || fireAt > windowEnd) continue;

        const notifKey = `${evKey}_${dateString}_${h}${String(m).padStart(2,'0')}_${adv}`;
        if (sentNotifs[notifKey]) continue;
        newSent[notifKey] = now;

        const advTxt     = adv > 0 ? ` — בעוד ${adv >= 60 ? (adv/60)+"שע'" : adv+"ד'"}` : '';
        const notifTitle = ev.title;
        const notifBody  = `${ev.time}${advTxt}`;

        for (const member of ev.members) {
          const memberTokens = allTokens[member] || {};
          for (const [deviceId, token] of Object.entries(memberTokens)) {
            if (!token || typeof token !== 'string') continue;

            promises.push(
              messaging.send({
                token,
                notification: { title: notifTitle, body: notifBody },
                webpush: {
                  notification: { requireInteraction: true, dir: 'rtl', lang: 'he', tag: notifKey, vibrate: [200,100,200] },
                  fcmOptions: { link: `${SITE_URL}/calendar.html` },
                },
              }).catch(err => {
                if (
                  err.code === 'messaging/registration-token-not-registered' ||
                  err.code === 'messaging/invalid-registration-token'
                ) {
                  return db.ref(`fcm_tokens/${member}/${deviceId}`).remove();
                }
              })
            );
          }
        }
      }
    }
  }

  if (Object.keys(newSent).length > 0) {
    await db.ref('sent_notifs').update(newSent);
    console.log('Sent:', Object.keys(newSent));
  }

  const threeDaysAgo = now - 3 * 86400000;
  const cleanup = Object.entries(sentNotifs)
    .filter(([, ts]) => ts < threeDaysAgo)
    .map(([k]) => db.ref(`sent_notifs/${k}`).remove());

  await Promise.all([...promises, ...cleanup]);
  console.log(`Checked ${Object.keys(events).length} events`);
}

checkReminders().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
