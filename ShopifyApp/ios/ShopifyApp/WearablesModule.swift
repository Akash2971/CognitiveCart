import Foundation
import MWDATCore
import MWDATCamera

@objc(WearablesModule)
class WearablesModule: RCTEventEmitter {

  private var session: StreamSession?
  private var stateToken: Any?
  private var photoToken: Any?
  private var pendingPhotoResolve: RCTPromiseResolveBlock?

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String] {
    return ["onStreamStateChange", "onPhotoCapture"]
  }

  // MARK: - Registration

  @objc func startRegistration(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      try Wearables.shared.startRegistration()
      resolve(nil)
    } catch {
      reject("REGISTRATION_ERROR", error.localizedDescription, error)
    }
  }

  // MARK: - Camera Permission

  @objc func requestCameraPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task {
      do {
        let status = try await Wearables.shared.requestPermission(.camera)
        resolve("\(status)")
      } catch {
        reject("PERMISSION_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Streaming

  @objc func startStream(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let config = StreamSessionConfig(
      videoCodec: .raw,
      resolution: .medium,
      frameRate: 24
    )
    let selector = AutoDeviceSelector(wearables: Wearables.shared)
    let session = StreamSession(streamSessionConfig: config, deviceSelector: selector)
    self.session = session

    stateToken = session.statePublisher.listen { [weak self] state in
      self?.sendEvent(withName: "onStreamStateChange", body: ["state": "\(state)"])
    }

    photoToken = session.photoDataPublisher.listen { [weak self] photoData in
      let base64 = photoData.data.base64EncodedString()
      self?.sendEvent(withName: "onPhotoCapture", body: ["data": base64])
      self?.pendingPhotoResolve?(base64)
      self?.pendingPhotoResolve = nil
    }

    Task { await session.start() }
    resolve(nil)
  }

  @objc func stopStream(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { await session?.stop() }
    session = nil
    stateToken = nil
    photoToken = nil
    resolve(nil)
  }

  // MARK: - Photo Capture

  @objc func capturePhoto(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let session else {
      reject("NO_SESSION", "Stream is not active. Call startStream first.", nil)
      return
    }
    pendingPhotoResolve = resolve
    session.capturePhoto(format: .jpeg)
  }

  // MARK: - Frame Capture

  @objc func captureCurrentFrame(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let image = StreamFrameBuffer.shared.latestImage else {
      reject("NO_FRAME", "No frame available. Is the stream running?", nil)
      return
    }
    guard let jpegData = image.jpegData(compressionQuality: 0.7) else {
      reject("ENCODE_ERROR", "Failed to encode frame as JPEG", nil)
      return
    }
    resolve(jpegData.base64EncodedString())
  }
}
