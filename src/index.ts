import type { API } from 'homebridge'

import { PLATFORM_NAME } from './settings'
import { MotionBlindsPlatform } from './platform'

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, MotionBlindsPlatform)
}
