# Changelog

## 3.0.0 — unreleased

- Unify position inversion across getters, notifications, and commands (#15, #23).
- Infer motion from position deltas, ignore immediate duplicate reports, and synchronize both HomeKit and cached targets after settling (#22, #25; thanks @nrocha22 for #26).
- Skip invalid/dual-motor position payloads and gateway devices; omit AC/unknown battery services and allow opting out of battery estimates.
- Bound polling per blind, dispose timers on removal/shutdown, preserve cached identities, and retain cached devices after individual read failures.
- Add tests using real Homebridge services, current TypeScript builds, package allowlist, UI schema fixes, Actions, and a rewritten README.
- Require Homebridge 2.4+ and Node 22/24/26. Publication depends on the motionblinds 3.0 release and dependency pin refresh; see README.
