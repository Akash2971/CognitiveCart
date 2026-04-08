import { NativeEventEmitter, NativeModules } from 'react-native';

const { WearablesModule } = NativeModules;
export const wearablesEmitter = new NativeEventEmitter(WearablesModule);

export default {
  startRegistration: (): Promise<void> =>
    WearablesModule.startRegistration(),

  requestCameraPermission: (): Promise<string> =>
    WearablesModule.requestCameraPermission(),

  startStream: (): Promise<void> =>
    WearablesModule.startStream(),

  stopStream: (): Promise<void> =>
    WearablesModule.stopStream(),

  capturePhoto: (): Promise<void> =>
    WearablesModule.capturePhoto(),

  captureCurrentFrame: (): Promise<string> =>
    WearablesModule.captureCurrentFrame(),
};
