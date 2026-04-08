import UIKit

final class StreamPreviewView: UIView {
  private let imageView = UIImageView()
  private var displayLink: CADisplayLink?

  override init(frame: CGRect) {
    super.init(frame: frame)
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.backgroundColor = .black
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    imageView.frame = bounds
    addSubview(imageView)

    displayLink = CADisplayLink(target: self, selector: #selector(tick))
    displayLink?.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
    displayLink?.add(to: .main, forMode: .common)
  }

  required init?(coder: NSCoder) { fatalError() }

  @objc private func tick() {
    if let image = StreamFrameBuffer.shared.latestImage {
      imageView.image = image
    }
  }

  override func removeFromSuperview() {
    displayLink?.invalidate()
    displayLink = nil
    super.removeFromSuperview()
  }
}
