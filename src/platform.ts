import type { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge'
import { DeviceStatus, DeviceType, MotionGateway, Report } from 'motionblinds'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import { MotionBlindsAccessory, validStatus } from './platformAccessory'

export type BlindAccessoryConfig = { mac: string; name?: string; tilt?: boolean; invert?: boolean; battery?: boolean }
export type BlindAccessoryContext = { mac?: string; deviceType?: DeviceType; status?: DeviceStatus; targetPosition?: number; targetAngle?: number }

export class MotionBlindsPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service
  public readonly Characteristic: typeof Characteristic
  public readonly accessories: PlatformAccessory[] = []
  public readonly blindConfigs = new Map<string, BlindAccessoryConfig>()
  public readonly gateway: MotionGateway
  public readonly pollSeconds: number
  private readonly handlers = new Map<string, MotionBlindsAccessory>()
  private stopped = false
  private discovery?: Promise<void>

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API) {
    this.Service = api.hap.Service
    this.Characteristic = api.hap.Characteristic
    this.pollSeconds = config.pollSeconds ?? 10
    if (!Number.isInteger(this.pollSeconds) || this.pollSeconds < 2 || this.pollSeconds > 3600) throw new Error('pollSeconds must be between 2 and 3600')
    if (config.key !== undefined && (typeof config.key !== 'string' || Buffer.byteLength(config.key) !== 16)) throw new Error('key must contain 16 UTF-8 bytes')
    if (config.blinds !== undefined && !Array.isArray(config.blinds)) throw new Error('blinds must be an array')
    for (const entry of config.blinds ?? []) {
      if (!entry || typeof entry.mac !== 'string' || !/^(?:[a-f\d]{12}|[a-f\d]{16})$/i.test(entry.mac)) throw new Error('Invalid blind MAC address')
      for (const option of ['invert', 'tilt', 'battery']) if (entry[option] !== undefined && typeof entry[option] !== 'boolean') throw new Error(`${option} must be boolean`)
      this.blindConfigs.set(entry.mac.toLowerCase(), { ...entry })
    }
    this.gateway = new MotionGateway({ key: config.key, gatewayIp: config.gatewayIp })
    this.gateway.on('error', () => this.log.error('MOTION gateway communication failed'))
    this.api.on('didFinishLaunching', () => {
      if (this.stopped) return
      this.gateway.on('report', this.handleReport)
      void this.discoverDevices()
    })
    this.api.on('shutdown', () => {
      this.stopped = true
      for (const handler of this.handlers.values()) handler.dispose()
      this.handlers.clear()
      this.gateway.removeListener('report', this.handleReport)
      this.gateway.stop()
    })
  }

  configureAccessory(accessory: PlatformAccessory) { this.accessories.push(accessory) }

  discoverDevices(): Promise<void> {
    if (this.stopped) return Promise.resolve()
    if (this.discovery) return this.discovery
    this.discovery = this.discover().finally(() => { this.discovery = undefined })
    return this.discovery
  }

  private async discover() {
    try {
      const list = await this.gateway.getDeviceList()
      if (this.stopped) return
      const devices = list.data.filter(device => !['02000001', '02000002'].includes(device.deviceType))
      const discovered = new Set(devices.map(device => device.mac.toLowerCase()))
      // Only a successful full list authorizes removal. An individual failed read does not.
      const removed = this.accessories.filter(accessory => !discovered.has(String(accessory.context.mac).toLowerCase()))
      for (const accessory of removed) {
        const mac = String(accessory.context.mac).toLowerCase()
        this.handlers.get(mac)?.dispose()
        this.handlers.delete(mac)
        this.accessories.splice(this.accessories.indexOf(accessory), 1)
      }
      if (removed.length) this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed)
      for (const device of devices) {
        if (this.stopped) return
        try {
          const result = await this.gateway.readDevice(device.mac, device.deviceType)
          this.maybeAddOrUpdateAccessory(device.mac, device.deviceType, result.data)
        } catch { this.log.warn(`Could not read blind ${device.mac}; keeping any cached accessory`) }
      }
    } catch { this.log.error('MOTION discovery failed; check gateway IP and local UDP connectivity') }
  }

  maybeAddOrUpdateAccessory(mac: string, deviceType: DeviceType, status: unknown) {
    if (this.stopped || ['02000001', '02000002'].includes(deviceType)) return
    if (!validStatus(status)) { this.log.warn(`Unsupported or incomplete status for ${mac}; single-motor position data is required`); return }
    mac = mac.toLowerCase()
    const handler = this.handlers.get(mac)
    if (handler) { handler.updateAccessory(status); return }
    // Prefer the cached MAC identity to preserve UUIDs created by older versions.
    let accessory = this.accessories.find(a => String(a.context.mac).toLowerCase() === mac)
    const isNew = !accessory
    if (!accessory) {
      accessory = new this.api.platformAccessory(this.blindConfigs.get(mac)?.name ?? mac, this.api.hap.uuid.generate(mac))
      this.accessories.push(accessory)
    }
    Object.assign(accessory.context, { mac, deviceType, status })
    this.handlers.set(mac, new MotionBlindsAccessory(this, accessory))
    if (isNew) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory])
    else this.api.updatePlatformAccessories([accessory])
  }

  handleReport = (report: Report) => this.maybeAddOrUpdateAccessory(report.mac, report.deviceType, report.data)
}
