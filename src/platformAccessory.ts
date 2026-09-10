import type { Service, PlatformAccessory } from 'homebridge'
import { BlindType, DeviceStatus, DeviceType, MotionGateway, Operation, VoltageMode } from 'motionblinds'
import { BlindAccessoryConfig, BlindAccessoryContext, MotionBlindsPlatform } from './platform'

export function validStatus(value: unknown): value is DeviceStatus {
  if (!value || typeof value !== 'object') return false
  const status = value as Partial<DeviceStatus>
  return Number.isFinite(status.currentPosition) && status.currentPosition! >= 0 && status.currentPosition! <= 100 && Number.isFinite(status.type)
}

export class MotionBlindsAccessory {
  private readonly service: Service
  private readonly battery?: Service
  private readonly config: BlindAccessoryConfig
  private readonly timer: ReturnType<typeof setInterval>
  private polling = false
  private disposed = false
  private movement: 0 | 1 | 2 = 2
  private previousAt = Date.now()
  private lastMovementAt = Date.now()
  private commandAt = 0
  private readonly currentTilt: typeof this.platform.Characteristic.CurrentVerticalTiltAngle | typeof this.platform.Characteristic.CurrentHorizontalTiltAngle

  constructor(private readonly platform: MotionBlindsPlatform, private readonly accessory: PlatformAccessory<BlindAccessoryContext>) {
    this.config = platform.blindConfigs.get(this.mac) ?? { mac: this.mac }
    const { Service, Characteristic: C } = platform
    accessory.getService(Service.AccessoryInformation)!
      .setCharacteristic(C.Manufacturer, 'MOTION')
      .setCharacteristic(C.Model, BlindType[this.status.type] ?? 'Blind')
      .setCharacteristic(C.SerialNumber, this.mac)
    this.service = accessory.getService(Service.WindowCovering) ?? accessory.addService(Service.WindowCovering)
    this.service.setCharacteristic(C.Name, this.config.name ?? accessory.displayName)
    this.accessory.context.targetPosition = this.position(this.status.currentPosition)
    this.accessory.context.targetAngle = Number.isFinite(this.status.currentAngle) && this.status.currentAngle >= 0 && this.status.currentAngle <= 180 ? this.angle(this.status.currentAngle) : 0
    this.service.getCharacteristic(C.CurrentPosition).onGet(() => this.position(this.status.currentPosition))
    this.service.getCharacteristic(C.PositionState).onGet(() => this.movement)
    this.service.getCharacteristic(C.TargetPosition).onGet(() => this.accessory.context.targetPosition!)
      .onSet(async value => {
        if (this.disposed) throw new Error('Plugin is shutting down')
        if (!this.platform.gateway.key) throw new Error('A MOTION key is required for control')
        const target = this.validate(value, 0, 100)
        await this.platform.gateway.writeDevice(this.mac, this.deviceType, { targetPosition: this.position(target) })
        if (this.disposed) return
        this.accessory.context.targetPosition = target
        this.commandAt = this.lastMovementAt = Date.now()
      })
    this.service.getCharacteristic(C.HoldPosition).onSet(async value => {
      if (!value) return
      if (this.disposed) throw new Error('Plugin is shutting down')
        if (!this.platform.gateway.key) throw new Error('A MOTION key is required for control')
      await this.platform.gateway.writeDevice(this.mac, this.deviceType, { operation: Operation.Stop })
      // A stop acknowledgement is not a new position reading. Poll to reconcile.
      await this.poll()
    })
    const horizontal = ![BlindType.RollerBlind, BlindType.VenetianBlind, BlindType.RomanBlind, BlindType.HoneycombBlind, BlindType.ShangriLaBlind, BlindType.Awning, BlindType.TopDownBottomUp, BlindType.DayNightBlind, BlindType.DimmingBlind, BlindType.DoubleRoller, BlindType.Switch].includes(this.status.type)
    this.currentTilt = horizontal ? C.CurrentHorizontalTiltAngle : C.CurrentVerticalTiltAngle
    const targetTilt = horizontal ? C.TargetHorizontalTiltAngle : C.TargetVerticalTiltAngle
    if (this.config.tilt) {
      this.service.getCharacteristic(this.currentTilt).onGet(() => this.angle(this.status.currentAngle))
      this.service.getCharacteristic(targetTilt).onGet(() => this.accessory.context.targetAngle!)
        .onSet(async value => {
          if (this.disposed) throw new Error('Plugin is shutting down')
        if (!this.platform.gateway.key) throw new Error('A MOTION key is required for control')
          const angle = this.validate(value, -90, 90)
          await this.platform.gateway.writeDevice(this.mac, this.deviceType, { targetAngle: angle + 90 })
          if (!this.disposed) this.accessory.context.targetAngle = angle
        })
    }
    const oldBattery = accessory.getService(Service.Battery)
    if (this.config.battery !== false && this.status.voltageMode !== VoltageMode.AC && Number.isFinite(this.status.batteryLevel) && this.status.batteryLevel > 0) {
      this.battery = oldBattery ?? accessory.addService(Service.Battery, 'Battery', 'Battery-1')
      this.battery.getCharacteristic(C.BatteryLevel).onGet(() => this.batteryLevel(this.status))
      this.battery.getCharacteristic(C.StatusLowBattery).onGet(() => this.batteryLevel(this.status) < 20 ? 1 : 0)
    } else if (oldBattery) accessory.removeService(oldBattery)
    this.timer = setInterval(() => { void this.poll() }, platform.pollSeconds * 1000)
    this.timer.unref()
  }

  get mac() { return this.accessory.context.mac! }
  get deviceType() { return this.accessory.context.deviceType as DeviceType }
  get status() { return this.accessory.context.status as DeviceStatus }
  position(raw: number) { return this.config.invert ? raw : 100 - raw }
  private validate(value: unknown, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid target')
    return value
  }
  private angle(value: number) { return this.validate(value, 0, 180) - 90 }
  batteryLevel(status: DeviceStatus) {
    if (!Number.isFinite(status.batteryLevel) || status.batteryLevel <= 0) throw new Error('Battery reading unavailable')
    return Math.round(MotionGateway.BatteryInfo(status.batteryLevel)[1] * 100)
  }
  dispose() { this.disposed = true; clearInterval(this.timer) }
  async poll() {
    if (this.polling || this.disposed) return
    this.polling = true
    try {
      const result = await this.platform.gateway.readDevice(this.mac, this.deviceType)
      if (!this.disposed) this.updateAccessory(result.data)
    } catch { if (!this.disposed) this.platform.log.warn(`Status read failed for ${this.mac}`) }
    finally { this.polling = false }
  }
  updateAccessory(value: unknown) {
    if (this.disposed || !validStatus(value)) return
    const now = Date.now(), previous = this.position(this.status.currentPosition), current = this.position(value.currentPosition)
    // Position deltas, not the gateway's persistent last-command field, indicate observed motion.
    if (current !== previous) {
      this.movement = current > previous ? 1 : 0
      this.lastMovementAt = now
    } else if (now - Math.max(this.lastMovementAt, this.commandAt) >= this.platform.pollSeconds * 1000 && now > this.previousAt) {
      this.movement = 2
    }
    this.previousAt = now
    this.accessory.context.status = value
    const C = this.platform.Characteristic
    this.service.updateCharacteristic(C.CurrentPosition, current)
    this.service.updateCharacteristic(C.PositionState, this.movement)
    if (this.movement === 2 && now - this.commandAt >= this.platform.pollSeconds * 1000) {
      this.accessory.context.targetPosition = current
      this.service.updateCharacteristic(C.TargetPosition, current)
    }
    if (this.config.tilt && Number.isFinite(value.currentAngle) && value.currentAngle >= 0 && value.currentAngle <= 180) this.service.updateCharacteristic(this.currentTilt, value.currentAngle - 90)
    if (this.battery) {
      const level = Number.isFinite(value.batteryLevel) && value.batteryLevel > 0 ? this.batteryLevel(value) : new Error('Battery reading unavailable')
      if (typeof level === 'number') {
        this.battery.updateCharacteristic(C.BatteryLevel, level)
        this.battery.updateCharacteristic(C.StatusLowBattery, level < 20 ? 1 : 0)
      } else {
        this.battery.updateCharacteristic(C.BatteryLevel, level)
        this.battery.updateCharacteristic(C.StatusLowBattery, level)
      }
    }
  }
}
