importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js');

firebase.initializeApp({
  apiKey: "AIzaSyCeSa8_KjYq0BjIv1hEpxNUs-jpffKhbIY",
  authDomain: "brawery-orange.firebaseapp.com",
  projectId: "brawery-orange",
  messagingSenderId: "937233603823",
  appId: "1:937233603823:web:fee3377fd43e72c2818f1a"
});

const messaging = firebase.messaging();

messaging.setBackgroundMessageHandler(function(payload) {
  const title = payload.notification && payload.notification.title
    ? payload.notification.title
    : "Brewery Orange";

  const notificationData = payload.webpush && payload.webpush.notification
    ? payload.webpush.notification
    : {};

  const options = {
    body: payload.notification && payload.notification.body
      ? payload.notification.body
      : "Tenés una notificación nueva",
    icon: notificationData.icon || "/icon.png",
    badge: "/icon.png",
    tag: notificationData.tag || undefined,
    renotify: notificationData.renotify === true,
    data: payload.data || {}
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});