import { Service, Characteristic } from 'homebridge';

export function createWindowCoveringService(hap: any) {
  const ServiceClass: typeof Service = hap.Service;
  const CharacteristicClass: typeof Characteristic = hap.Characteristic;

  const svc = new ServiceClass.WindowCovering('Window Covering');

  // Ensure necessary characteristics exist
  svc.getCharacteristic(CharacteristicClass.CurrentPosition);
  svc.getCharacteristic(CharacteristicClass.TargetPosition);
  svc.getCharacteristic(CharacteristicClass.PositionState);

  return svc;
}

export function createBatteryService(hap: any) {
  const ServiceClass: typeof Service = hap.Service;
  const CharacteristicClass: typeof Characteristic = hap.Characteristic;

  const svc = new ServiceClass.BatteryService('Battery');
  svc.getCharacteristic(CharacteristicClass.BatteryLevel);
  svc.getCharacteristic(CharacteristicClass.ChargingState);
  svc.getCharacteristic(CharacteristicClass.StatusLowBattery);

  return svc;
}

export default { createWindowCoveringService, createBatteryService };
