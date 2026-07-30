# Portfolio data reliability

The operational application uses remote transaction, backup, archive, and mirror workflows. In this portfolio, the same UI-facing save and subscription interfaces are provided by `firebase.js`, but all data remains in the current browser.

There are no remote retries, service credentials, Firebase rules, or production deployment commands in this repository.
