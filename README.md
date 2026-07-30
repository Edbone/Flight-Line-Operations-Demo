# Flight Line Operations — Portfolio Demo

This repository mirrors the interface and workflows of the operational flight-line application without connecting to its production data.

## Data safety

- Firebase Authentication, Firestore, and Storage are replaced by a browser-only adapter in `firebase.js`.
- The site uses a fixed fictional administrator from `auth.js`; no login request is made.
- Edits are stored only in the current browser's `localStorage`.
- Student, instructor, attendance, tuition, written-test, and staff examples are fictional portfolio data.
- Production Firebase deployment files, service credentials, synchronization jobs, and mutating server APIs are intentionally excluded.
- The fleet maintenance dashboard is the only live embedded integration.

Clearing site data in the browser resets local edits. Nothing in this repository can write to the operational Firebase project.

## Run locally

```bash
npm test
npx serve .
```

Then open the local URL printed by the server. ES modules require an HTTP server; opening the HTML files directly is not recommended.

## Deployment

The static app can be deployed to Vercel. Do not add production Firebase, MyFBO, or service-account environment variables to the portfolio deployment.
