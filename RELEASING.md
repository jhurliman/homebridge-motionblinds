# Releasing homebridge-motionblinds

## Version 3 dependency sequence

1. Merge and publish [motionblinds 3.0](https://github.com/jhurliman/node-motionblinds/pull/14).
2. Change this plugin’s dependency to `motionblinds: ^3.0.0` and regenerate the lockfile. The current compatibility range permits both 2.3.1 and 3.0, but the lockfile still selects 2.3.1.
3. Run `npm ci`, `npm test`, and `npm pack` against the published dependency.
4. Verify gateway discovery and deliberately selected controls on supported hardware. Confirm Windows networking where applicable.
5. Publish the plugin after validation. Do not attribute the parent client’s version 3 timeout/Windows fixes to installations using version 2.3.1.

Keep installation requirements, supported features, migration behavior, and hardware limitations in the README. Keep temporary publication status and this checklist here.
