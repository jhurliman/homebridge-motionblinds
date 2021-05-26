# homebridge-motionblinds

[![npm](https://badgen.net/npm/v/homebridge-motionblinds)](https://www.npmjs.com/package/homebridge-motionblinds)
[![npm](https://badgen.net/npm/dt/homebridge-motionblinds)](https://www.npmjs.com/package/homebridge-motionblinds)

Homebridge plugin to control MOTION Blinds by Coulisse B.V. including derivative products such as OmniaBlinds.

## Installation
1. Follow the step-by-step instructions on the [Homebridge Wiki](https://github.com/homebridge/homebridge/wiki) for how to install Homebridge.
2. Follow the step-by-step instructions on the [Homebridge Config UI X](https://github.com/oznu/homebridge-config-ui-x/wiki) for how to install Homebridge Config UI X.
3. Install homebridge-motionblinds using: `npm install -g homebridge-motionblinds` or search for `MOTION Blinds` in Config UI X.

## Info
1. Blinds are only identified by a 16-character MAC address. They will show up in HomeKit with the MAC address as their name. You can rename them in HomeKit or using the configuration options below.
2. If your blinds support tilt angle control, you must manually enable it using the "tilt" config option described below.
3. If your blind is moving up when it should move down, or left when it should move right, use the "invert" config option described below.

## Configuration

All fields are optional except `"platform"`, and `"mac"` if any blinds are specified. If no `"key"` is given, blinds will appear as read only with no control. If you are having connectivity issues, try specifying the `"gatewayIp"`.

```json
{
  "platform": "MotionBlinds",
  "key": "xxxxxxxx-xxxx-xx",
  "gatewayIp": "10.0.0.23",
  "blinds": [
    {
      "mac": "xxxxxxxxxxxxxxxx",
      "name": "Bedroom Blinds",
      "tilt": true,
      "invert": false
    },
    {
      "mac": "xxxxxxxxxxxxxxxx",
      "name": "Living Room Roller Shade",
      "tilt": false,
      "invert": false
    }
  ]
}
```
