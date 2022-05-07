import type { Service, PlatformAccessory } from 'homebridge'
import { BlindType, DeviceStatus, DeviceType, MotionGateway, Operation } from 'motionblinds'

import { BlindAccessoryConfig, BlindAccessoryContext, MotionBlindsPlatform } from './platform'

function IsVerticalBlind(blindType: BlindType) {
  switch (blindType) {
    case BlindType.RollerBlind:
    case BlindType.VenetianBlind:
    case BlindType.RomanBlind:
    case BlindType.HoneycombBlind:
    case BlindType.ShangriLaBlind:
    case BlindType.Awning:
    case BlindType.TopDownBottomUp:
    case BlindType.DayNightBlind:
    case BlindType.DimmingBlind:
    case BlindType.DoubleRoller:
    case BlindType.Switch:
      return true
    default:
      return false
  }
}

export class MotionBlindsAccessory {
  private service: Service
  private battery: Service
  private config: BlindAccessoryConfig

  constructor(
    private readonly platform: MotionBlindsPlatform,
    private readonly accessory: PlatformAccessory<BlindAccessoryContext>,
  ) {
    this.config = this.platform.blindConfigs.get(this.mac) ?? { mac: this.mac }

    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'MOTION')
      .setCharacteristic(this.platform.Characteristic.Model, BlindType[this.status.type])
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.mac)

    // TODO: Support TDBU blinds by creating two separate WindowCovering services

    this.service =
      this.accessory.getService(this.platform.Service.WindowCovering) ??
      this.accessory.addService(this.platform.Service.WindowCovering)

    this.service.setCharacteristic(this.platform.Characteristic.Name, this.config.name ?? this.mac)

    this.service
      .getCharacteristic(this.platform.Characteristic.CurrentPosition)
      .on('get', (callback) => callback(null, this.status.currentPosition))

    this.service
      .getCharacteristic(this.platform.Characteristic.PositionState)
      .on('get', (callback) => callback(null, this.positionState(this.status)))

    // A key is required for write commands
    if (this.platform.gateway.key) {
      this.service
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .on('get', (callback) => callback(null, this.accessory.context.targetPosition))
        .on('set', (value, callback) => {
          const targetPosition = value as number
          const effectiveTarget = this.config.invert ? 100 - targetPosition : targetPosition
          this.accessory.context.targetPosition = targetPosition
          this.platform.gateway
            .writeDevice(this.mac, this.deviceType, { targetPosition: effectiveTarget })
            .then(() => callback(null))
            .catch((err) => callback(err))
        })

      this.service
        .getCharacteristic(this.platform.Characteristic.HoldPosition)
        .on('set', (value, callback) => {
          if (!value) {
            return callback(null, value)
          }
          this.platform.gateway
            .writeDevice(this.mac, this.deviceType, { operation: Operation.Stop })
            .then(() => callback(null, value))
            .catch((err) => callback(err, null))
        })

      if (this.config.tilt) {
        const targetTiltCharacteristic = IsVerticalBlind(this.status.type)
          ? this.platform.Characteristic.TargetVerticalTiltAngle
          : this.platform.Characteristic.TargetHorizontalTiltAngle

        this.service
          .getCharacteristic(targetTiltCharacteristic)
          .on('get', (callback) => callback(null, this.accessory.context.targetAngle))
          .on('set', (value, callback) => {
            const targetAngle = value as number
            const effectiveTarget = targetAngle + 90 // Convert from [-90, 90] to [0, 180]
            this.accessory.context.targetAngle = targetAngle
            this.platform.gateway
              .writeDevice(this.mac, this.deviceType, { targetAngle: effectiveTarget })
              .then(() => callback(null))
              .catch((err) => callback(err))
          })
      }
    }

    if (this.config.tilt) {
      const currentTiltCharacteristic = IsVerticalBlind(this.status.type)
        ? this.platform.Characteristic.CurrentVerticalTiltAngle
        : this.platform.Characteristic.CurrentHorizontalTiltAngle

      this.service
        .getCharacteristic(currentTiltCharacteristic)
        .on('get', (callback) => callback(null, this.status.currentAngle - 90))
    }

    this.battery =
      this.accessory.getService('Battery') ??
      this.accessory.addService(this.platform.Service.Battery, 'Battery', 'Battery-1')

    this.battery
      .getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .on('get', (callback) => callback(null, this.batteryStatus(this.status)))

    this.battery
      .getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .on('get', (callback) => callback(null, this.batteryLevel(this.status)))

    // Poll for any inconsistent state every 10s
    setInterval(() => {
      this.platform.gateway
        .readDevice(this.mac, this.deviceType)
        .then((res) => this.updateAccessory(res.data))
        .catch((err) => {
          this.platform.log.error(`readDevice(${this.mac}, ${this.deviceType}) failed:`, err)
        })
    }, 10000)

    this.platform.gateway.on('report', (report) => {
      if (report.mac === this.mac) {
        this.updateAccessory(report.data)
      }
    })
  }

  get mac() {
    return this.accessory.context.mac as string
  }

  get deviceType() {
    return this.accessory.context.deviceType as DeviceType
  }

  get status() {
    return this.accessory.context.status as DeviceStatus
  }

  batteryLevel(status: DeviceStatus) {
    return MotionGateway.BatteryInfo(status.batteryLevel)[1] * 100
  }

  batteryStatus(status: DeviceStatus) {
    return this.batteryLevel(status) >= 20
      ? this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
  }

  positionState(status: DeviceStatus): 0 | 1 | 2 {
    const DECREASING = this.platform.Characteristic.PositionState.DECREASING
    const INCREASING = this.platform.Characteristic.PositionState.INCREASING
    if (status.operation === Operation.CloseDown) {
      return this.config.invert ? INCREASING : DECREASING
    } else if (status.operation === Operation.OpenUp) {
      return this.config.invert ? DECREASING : INCREASING
    }
    return this.platform.Characteristic.PositionState.STOPPED
  }

  // Broadcast updates for any characteristics that changed, then update `this.accessory.context.status`
  updateAccessory(newStatus: DeviceStatus) {
    const prevStatus = this.status
    const prevState = this.positionState(prevStatus)
    const newState = this.positionState(newStatus)

    if (newStatus.currentPosition !== prevStatus.currentPosition) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.CurrentPosition,
        newStatus.currentPosition,
      )
    }

    if (newState !== prevState) {
      this.service.updateCharacteristic(this.platform.Characteristic.PositionState, newState)
    }

    if (this.config.tilt && newStatus.currentAngle !== prevStatus.currentAngle) {
      const currentTiltCharacteristic = IsVerticalBlind(newStatus.type)
        ? this.platform.Characteristic.CurrentVerticalTiltAngle
        : this.platform.Characteristic.CurrentHorizontalTiltAngle
      this.service.updateCharacteristic(currentTiltCharacteristic, newStatus.currentAngle - 90)
    }

    const prevBattery = this.batteryLevel(prevStatus)
    const newBattery = this.batteryLevel(newStatus)
    if (prevBattery !== newBattery) {
      this.service.updateCharacteristic(this.platform.Characteristic.BatteryLevel, newBattery)
    }

    const prevBatteryStatus = this.batteryStatus(prevStatus)
    const newBatteryStatus = this.batteryStatus(newStatus)
    if (prevBatteryStatus !== newBatteryStatus) {
      this.service.updateCharacteristic(
        this.platform.Characteristic.StatusLowBattery,
        newBatteryStatus,
      )
    }

    this.accessory.context.status = newStatus
  }
}
