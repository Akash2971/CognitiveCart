import Foundation
import MWDATCore
import MWDATCamera

@objc(WearablesModule)
class WearablesModule: RCTEventEmitter {

  private var session: StreamSession?
  private var stateToken: Any?
  private var photoToken: Any?
  private var frameToken: Any?
  private var frameCounter = 0

  override static func requiresMainQueueSetup() -> Bool { true }

  override func supportedEvents() -> [String] {
    return ["onStreamStateChange", "onPhotoCapture", "onVideoFrame"]
  }

  // MARK: - Registration

  @objc func startRegistration(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      do {
        print("[WearablesModule] calling startRegistration()")
        try Wearables.shared.startRegistration()
        print("[WearablesModule] startRegistration() succeeded")
        resolve(nil)
      } catch RegistrationError.alreadyRegistered {
        print("[WearablesModule] already registered, treating as success")
        resolve(nil)
      } catch let error as RegistrationError {
        print("[WearablesModule] RegistrationError: \(error) rawValue=\(error.rawValue) description=\(error.description)")
        reject("REGISTRATION_ERROR", "RegistrationError.\(error): \(error.description)", error)
      } catch {
        print("[WearablesModule] unknown error: \(error)")
        reject("REGISTRATION_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - Camera Permission

  @objc func requestCameraPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
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
    Task { @MainActor in
      let config = StreamSessionConfig(
        videoCodec: .raw,
        resolution: .medium,
        frameRate: 30
      )
      let selector = AutoDeviceSelector(wearables: Wearables.shared)
      let session = StreamSession(streamSessionConfig: config, deviceSelector: selector)
      self.session = session
      self.frameCounter = 0

      self.stateToken = session.statePublisher.listen { [weak self] state in
        self?.sendEvent(withName: "onStreamStateChange", body: ["state": "\(state)"])
      }

      self.photoToken = session.photoDataPublisher.listen { [weak self] photoData in
        let base64 = photoData.data.base64EncodedString()
        self?.sendEvent(withName: "onPhotoCapture", body: ["data": base64])
      }

      self.frameToken = session.videoFramePublisher.listen { frame in
        guard let image = frame.makeUIImage() else { return }
        StreamFrameBuffer.shared.latestImage = image
      }

      await session.start()
      resolve(nil)
    }
  }

  @objc func stopStream(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      await self.session?.stop()
      self.session = nil
      self.stateToken = nil
      self.photoToken = nil
      self.frameToken = nil
      self.frameCounter = 0
      resolve(nil)
    }
  }

  // MARK: - Photo Capture

  @objc func capturePhoto(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    Task { @MainActor in
      guard let session = self.session else {
        reject("NO_SESSION", "Stream is not active. Call startStream first.", nil)
        return
      }
      session.capturePhoto(format: .jpeg)
      resolve(nil)
    }
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
