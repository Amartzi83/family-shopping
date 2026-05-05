'use strict';

// In-memory map of scheduled timers (cleared if SW is killed by OS)
const scheduled = new Map();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(clients.claim()));

// Main thread sends SCHEDULE message with list of upcoming alarms
self.addEventListener('message', event => {
  if (!event.data || event.data.type !== 'SCHEDULE') return;

  // Clear all existing timers
  for (const timer of scheduled.values()) clearTimeout(timer);
  scheduled.clear();

  const now = Date.now();
  const MAX_AHEAD = 48 * 60 * 60 * 1000; // 48 hours

  for (const alarm of (event.data.alarms || [])) {
    const delay = alarm.fireAt - now;
    if (delay <= 0 || delay > MAX_AHEAD) continue;

    const t = setTimeout(async () => {
      scheduled.delete(alarm.id);
      try {
        await self.registration.showNotification(alarm.title, {
          body: alarm.body || '',
          icon: 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📅</text></svg>'
          ),
          badge: 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📅</text></svg>'
          ),
          tag: 'cal-' + alarm.id,
          requireInteraction: true,
          dir: 'rtl',
          lang: 'he',
          vibrate: [200, 100, 200, 100, 200],
          data: { url: self.registration.scope + 'calendar.html' }
        });
      } catch (e) {
        console.error('showNotification failed', e);
      }
    }, delay);

    scheduled.set(alarm.id, t);
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url)
    || self.registration.scope + 'calendar.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('calendar') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
