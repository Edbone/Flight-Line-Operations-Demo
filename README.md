# AOA SSR Hub

A starter home page for the AOA SSR Hub with a white/blue/yellow theme, built for Vercel deployment.

## What is included

- `index.html` - the hub landing page
- `styles.css` - light theme styling with blue and yellow accents
- `sheet1.html` - first page for Ground Trainer 1 scheduling and tabs
- `firebase.js` - placeholder Firebase initialization and Firestore helpers

## Firebase setup

1. Create a Firebase project in the Firebase console.
2. Enable Firestore in your Firebase project.
3. Replace the placeholder config values in `firebase.js` with your Firebase project settings.
4. Use `saveFormData(sheetId, data)` and `loadFormData(sheetId)` from `firebase.js` in your sheet pages.

## Vercel deployment

This is a static site that can be deployed directly to Vercel:

- Push the project to GitHub.
- Import the repository into Vercel.
- Vercel will detect the static site and deploy it automatically.

## Next steps

1. Add the first sheet page, such as `sheet1.html` or `sheet1.js`.
2. Link that page from the home page cards.
3. Build form input and Firebase saving/loading logic on the new sheet page.

## How to view

Open `index.html` in your browser for local preview, or deploy to Vercel for hosting.

If you want, I can help you build the first sheet and wire it directly into Firebase next.
