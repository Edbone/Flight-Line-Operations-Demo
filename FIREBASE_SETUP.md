# Remote data is intentionally disabled

This portfolio repository must not be connected to the operational Firebase project.

`firebase.js` is a browser-local compatibility layer. It preserves the same application-facing functions used by the production site while storing data only in `localStorage`. `auth.js` provides a fixed fictional demo identity and does not load the Firebase SDK.

Do not add a Firebase API key, project ID, service-account JSON, or production deployment rules to this repository. If a separate demo backend is ever required, create a new isolated project and review every data path before enabling it.
