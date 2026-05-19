importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDGP5nqOB39ENoeRIMpFo_B3Ya2RBE99sg",
  authDomain: "family-shopping-9f8a6.firebaseapp.com",
  databaseURL: "https://family-shopping-9f8a6-default-rtdb.firebaseio.com",
  projectId: "family-shopping-9f8a6",
  storageBucket: "family-shopping-9f8a6.firebasestorage.app",
  messagingSenderId: "7886163686",
  appId: "1:7886163686:web:544391dd14dac18b2ab527"
});

const messaging = firebase.messaging();

// Handle background push messages (app is closed/minimized)
messaging.onBackgroundMessage(payload => {
  const n = (payload.webpush && payload.webpush.notification) || payload.notification || {};
  return self.registration.showNotification(n.title || 'תזכורת', {
    body:            n.body || '',
    icon:            n.icon || '/family-shopping/icon-192.png',
    badge:           n.icon || '/family-shopping/icon-192.png',
    requireInteraction: true,
    dir:             'rtl',
    lang:            'he',
    vibrate:         [200, 100, 200, 100, 200],
    tag:             n.tag  || 'cal-notif',
    data: { url: 'https://Amartzi83.github.io/family-shopping/calendar.html' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url)
    || 'https://Amartzi83.github.io/family-shopping/calendar.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('calendar') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
