# Releasing homebridge-motionblinds

The maintainer no longer has the required account or hardware. Releases may proceed after automated checks, with the README and release notes explicitly stating that live compatibility is unverified. Do not describe simulated tests as hardware or service validation. Invite active users to test and take over maintenance.

- Publish `motionblinds` first, require `^3.0.0`, and regenerate the lockfile.
- Run `npm ci`, `npm test`, and `npm pack` against the published dependencies. Confirm supported Node/Homebridge versions, entry points, UI schema, documentation, and license.
- Review migration notes and publish. Keep known compatibility issues open until an active user verifies a fix.

## Community validation

Verify gateway discovery, status reports, networking on your OS, and commands on a deliberately selected motor. Report gateway model and firmware without exposing API keys.
