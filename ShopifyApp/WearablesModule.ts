import { NativeEventEmitter, NativeModules } from 'react-native';

const { WearablesModule } = NativeModules;
export const wearablesEmitter = new NativeEventEmitter(WearablesModule);

export default {
  startRegistration: (): Promise<void> =>
    WearablesModule.startRegistration(),

  checkCameraPermission: (): Promise<string> =>
    WearablesModule.checkCameraPermission?.() ?? Promise.resolve('unknown'),

  requestCameraPermission: (): Promise<string> =>
    WearablesModule.requestCameraPermission(),

  startStream: (): Promise<void> =>
    WearablesModule.startStream(),

  stopStream: (): Promise<void> =>
    WearablesModule.stopStream(),

  capturePhoto: (): Promise<string> =>
    WearablesModule.capturePhoto(),

  captureCurrentFrame: (): Promise<string> =>
    WearablesModule.captureCurrentFrame(),
};
