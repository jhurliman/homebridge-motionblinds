# homebridge-motionblinds

[![CI](https://github.com/jhurliman/homebridge-motionblinds/actions/workflows/ci.yml/badge.svg)](https://github.com/jhurliman/homebridge-motionblinds/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/homebridge-motionblinds.svg)](https://www.npmjs.com/package/homebridge-motionblinds)

Control MOTION gateway blinds from Apple Home over your local network. The plugin discovers blinds, exposes position and optional tilt controls, and updates HomeKit from gateway reports plus periodic status reads. It supports compatible Coulisse-based products; matching branding alone does not establish protocol compatibility.

Requires **Homebridge 2.4+ and Node 22, 24, or 26**. See [CHANGELOG.md](CHANGELOG.md) for version 3 migration notes.

## Maintainer wanted

The current maintainer no longer has a compatible MOTION Blinds gateway and motors and cannot test this integration against a live setup. Automated tests pass, but this release has not been validated on physical hardware. Compatibility reports and fixes from active users are welcome.

If you use this integration and would like to take over maintenance and releases, [open an issue](https://github.com/jhurliman/homebridge-motionblinds/issues/new?title=Interested%20in%20maintaining%20this%20project) describing your setup and interest.

## Get connected

Install `homebridge-motionblinds` through Homebridge UI. Add a `MotionBlinds` platform, enter the gateway's local IP, and supply the **16-byte local API key** from the MOTION app to enable control. Without a key, position readings work and write requests return an error.

The gateway and Homebridge must be able to exchange local UDP traffic: gateway commands use port 32100 and discovery/reports use multicast `238.0.0.18:32101`. A configured IP helps with discovery but does not bypass firewalls, VLAN routing, or container networking. This is a local gateway integration; Matter/Thread-only devices are a different protocol.

## Configuration

Place this entry in `config.json`'s `platforms` array, or use the included Homebridge UI form:

```json
{
  "platform": "MotionBlinds",
  "name": "MOTION Blinds",
  "gatewayIp": "192.168.1.23",
  "pollSeconds": 10,
  "blinds": [
    {
      "mac": "aabbccddeeff",
      "name": "Bedroom shade",
      "invert": false,
      "tilt": false,
      "battery": true
    }
  ]
}
```

Add `key` through the password field in Homebridge UI; the example intentionally contains no working control key. `blinds` overrides discovered devices rather than acting as an allowlist. MACs are 12 or 16 hexadecimal digits, case-insensitive. Existing cached identities are reused when their MAC matches.

| Option | Meaning |
| --- | --- |
| `gatewayIp` | Local IPv4 gateway address; recommended for predictable selection |
| `key` | 16-byte local API key; required to move or stop blinds |
| `pollSeconds` | Status interval, default 10, range 2–3600. One outstanding poll per blind. |
| `blinds[].name` | Accessory display name |
| `blinds[].invert` | Reverse the position conversion for motors with opposite orientation |
| `blinds[].tilt` | Expose tilt-angle controls when supported by the motor |
| `blinds[].battery` | Set false to omit battery reporting for incompatible encodings; mains-powered devices omit it automatically |

## Position and movement

HomeKit uses **0 = closed, 100 = open**. By default the plugin converts the gateway's position with `100 - raw`; `invert: true` uses `raw` directly. The same rule is used for reads, notifications, and commands. The default command direction is preserved from 2.x, while its mismatched displayed position is corrected. Recheck each blind's orientation before using existing scenes after upgrading.

Movement is inferred from changes in position, not the gateway's `operation` field, which can retain the last command after a motor stops. An unchanged position for a polling interval settles the HomeKit target to the observed position. This also updates the cached target returned to HomeKit, preventing an old target from restoring the animation. Duplicate reports arriving close together do not immediately cancel a movement indication.

This is sampled motion estimation: slow movement, delayed packets, and firmware-specific reporting can affect when a tile settles. A command acknowledgement does not prove that the physical blind reached its target. Stop is sent only when explicitly requested; settling a tile does not issue a motor command.

## Device and battery limits

- Standard single-motor position payloads are supported. Incomplete payloads and dual-motor top-down/bottom-up or double-roller payloads are skipped with a diagnostic instead of passing `undefined` positions into HomeKit. Two-rail control needs separate services and hardware validation.
- The battery estimate comes from the client library's voltage-to-percentage conversion. Zero/missing readings and AC power are not treated as a low battery. Use `battery: false` if a derivative gateway uses another encoding.
- Gateway records are excluded from blind reads. Discovery has no 16-device limit; tests cover 28 devices. A failed read retains a cached accessory, while a successful complete device list removes accessories that disappeared.
- Shutdown clears polling and report handlers and closes the gateway. Late replies do not recreate accessories.

For unresponsive devices, include gateway model/firmware, Homebridge/Node versions, local network layout, and whether the gateway list includes the blind. Omit API keys and access tokens. Reports involving Connector+, 3DayBlinds, and CMD-01 hardware remain subject to device-specific verification.

## Development and release

```sh
npm ci
npm test
npm pack
```

Tests use real Homebridge services and simulated gateway responses. They cover inversion, movement settling, target synchronization, battery handling, incomplete payloads, no-key control, polling shutdown, and 28-device discovery. No physical blinds are moved.

See [RELEASING.md](RELEASING.md) for maintainer release checks and dependency publication order.

Thanks to [@nrocha22](https://github.com/nrocha22) for the packet analysis and position-delta proposal in [#25](https://github.com/jhurliman/homebridge-motionblinds/issues/25) and [#26](https://github.com/jhurliman/homebridge-motionblinds/pull/26).

## License

MIT. See [LICENSE](LICENSE).
