import UIKit

final class StreamFrameBuffer {
  static let shared = StreamFrameBuffer()
  private init() {}

  private let lock = NSLock()
  private var _latestImage: UIImage?

  var latestImage: UIImage? {
    get {
      lock.lock()
      defer { lock.unlock() }
      return _latestImage
    }
    set {
      lock.lock()
      _latestImage = newValue
      lock.unlock()
    }
  }
}
