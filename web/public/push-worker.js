// Web Push Notifications & Background Click Handler
self.addEventListener("push", function (event) {
  var data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  var title = data.title || "The Man Van";
  var options = {
    body: data.body || "New notification from The Man Van",
    icon: data.icon || "/icons/icon-192.png",
    badge: data.badge || "/icons/icon-192.png",
    data: {
      url: data.url || "/"
    },
    tag: data.tag || "tmv-push-" + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200]
  };

  // Broadcast to open clients for in-app alert sync
  try {
    if (typeof BroadcastChannel !== "undefined") {
      var channel = new BroadcastChannel("tmv_in_app_notifications");
      channel.postMessage({
        type: "PUSH_NOTIFICATION_RECEIVED",
        payload: data
      });
    }
  } catch (err) {}

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      // If an existing app window is open, navigate and focus it
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ("focus" in client) {
          if (client.url.indexOf(self.location.origin) !== -1) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

