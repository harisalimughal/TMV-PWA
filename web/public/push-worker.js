// Web Push Notifications & Background Click Handler

// Persisted notification history for the app's bell icon -- see
// src/lib/pwa/notificationLog.ts, which reads this exact same IndexedDB database.
// Kept in plain vanilla IndexedDB calls (no import) so both sides open an identical
// schema without sharing a build step; DB_NAME/STORE_NAME/DB_VERSION must stay in
// sync with that file by hand.
var NOTIF_DB_NAME = "tmv-notifications";
var NOTIF_STORE_NAME = "notifications";
var NOTIF_DB_VERSION = 1;

function notifOpenDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(NOTIF_DB_NAME, NOTIF_DB_VERSION);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(NOTIF_STORE_NAME)) {
        db.createObjectStore(NOTIF_STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

function notifLog(title, body, url, kind) {
  return notifOpenDb()
    .then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(NOTIF_STORE_NAME, "readwrite");
        var request = tx.objectStore(NOTIF_STORE_NAME).add({
          title: title,
          body: body,
          url: url,
          kind: kind,
          receivedAt: Date.now(),
          read: false,
          dismissed: false
        });
        tx.oncomplete = function () {
          resolve(request.result);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    })
    .catch(function () {
      /* Best-effort -- a logging failure must never block showing the real OS
         notification, which is the part that actually matters. */
      return null;
    });
}

function notifMarkRead(url) {
  return notifOpenDb()
    .then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(NOTIF_STORE_NAME, "readwrite");
        var store = tx.objectStore(NOTIF_STORE_NAME);
        var cursorReq = store.openCursor(null, "prev");
        var done = false;
        cursorReq.onsuccess = function () {
          var cursor = cursorReq.result;
          if (!cursor || done) return;
          var entry = cursor.value;
          if (!done && entry.url === url && !entry.read) {
            done = true;
            cursor.update(Object.assign({}, entry, { read: true }));
          } else {
            cursor.continue();
          }
        };
        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    })
    .catch(function () {
      /* Best-effort, same as notifLog. */
    });
}

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
  var body = data.body || "New notification from The Man Van";
  var url = data.url || "/";
  var kind = data.data && data.data.kind;
  var options = {
    body: body,
    icon: data.icon || "/icons/icon-192.png",
    // No badge fallback here either -- see push.service.ts's sendNotificationToSubscription
    // for why: icon-192.png is a full-color, fully-opaque image, not the transparent
    // monochrome silhouette Android's badge field needs, and shipping it as one renders
    // as a solid white/tinted square in the status bar. Only set this once a real
    // simplified mark exists; omitting it lets the OS use its own sensible default.
    data: {
      url: url
    },
    tag: data.tag || "tmv-push-" + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200]
  };
  if (data.badge) options.badge = data.badge;

  event.waitUntil(
    Promise.all([
      notifLog(title, body, url, kind).then(function (notificationId) {
        // Broadcast only after IndexedDB has assigned the row ID. The open app uses
        // that ID to remember when this persistent center notice is explicitly closed.
        try {
          if (typeof BroadcastChannel !== "undefined") {
            var channel = new BroadcastChannel("tmv_in_app_notifications");
            channel.postMessage({
              type: "PUSH_NOTIFICATION_RECEIVED",
              payload: Object.assign({}, data, { notificationId: notificationId })
            });
            channel.close();
          }
        } catch (err) {}
      }),
      self.registration.showNotification(title, options)
    ])
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var data = event.notification.data || {};
  var targetUrl = data.url || "/";

  event.waitUntil(
    Promise.all([
      notifMarkRead(targetUrl),
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
    ])
  );
});
