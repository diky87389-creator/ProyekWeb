---
name: testing-proyekweb
description: How to run and end-to-end test the Warung Sayur Diky static site (ProyekWeb) locally, including auth/localStorage state and the Google login fallback.
---

# Testing ProyekWeb (Warung Sayur Diky)

## Run locally
```bash
cd <repo> && npm install && npm start   # express static server, http://localhost:3000 (PORT env overrides)
```
Pages are plain HTML: `/login.html`, `/daftar.html`, `/index.html`, `/profile.html`, `/keranjang.html`, `/orders.html`.

## App state (all client-side)
localStorage keys:
- `dikyRegisteredUsers` — array of accounts (`fullName`, `emailAddress`, `password`, `phoneNumber`, `avatarUrl`, `authProvider`)
- `dikyActiveUser` — current session (profile.html reads this)
- `dikyPendingGoogleProfile` — profile carried from login → daftar prefill (login.html clears it on load)
- also `dikyCart`, `dikyOrders`, `dikyDebts` for other flows

Reset between test runs with `localStorage.clear()` in the console, then reload. There is no backend/DB — never use curl for auth.

## Auth flows worth knowing
- login.html has NO "Daftar di sini" link. Submitting an unregistered email (or entering one in the Google flow) stores the pending profile, toasts "Akun belum terdaftar…" and redirects to daftar.html after ~1.5 s with name/email prefilled.
- Wrong password → toast "Kata sandi salah…", stays on login.html. Correct → index.html after ~1.7 s. Redirects are timer-based, so wait 2-3 s before asserting the URL.
- `googleClientId` in `login.js` is empty by default, so "Masuk dengan Google" falls back to `window.prompt` for email (and name only if the email is unknown). These are native Chrome dialogs — type into them directly with computer-use, click OK.
- To exercise the Google-photo path without a real OAuth client, set `avatarUrl` on the user in `dikyRegisteredUsers` (a `/images/...` URL or data URI works) and then sign in via the Google button; profile.html then shows the photo plus "Akun Google". A broken URL should fall back to initials.
- Logout: profile.html header has "Logout Cepat" (session only) and "Logout Bersih Total".

## Responsive
login.css breaks at 820px. Resize the real window (`wmctrl -r :ACTIVE: -e 0,0,0,520,760`) instead of devtools so the recording stays readable; re-maximize with `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`.

## Devin Secrets Needed
None — fully local, no credentials required.
