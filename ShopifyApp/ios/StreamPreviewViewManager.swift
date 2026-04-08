import Foundation

@objc(StreamPreviewViewManager)
final class StreamPreviewViewManager: RCTViewManager {
  override func view() -> UIView! {
    return StreamPreviewView()
  }

  override static func requiresMainQueueSetup() -> Bool { true }
}
