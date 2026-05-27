#import <React/RCTBridgeModule.h>
#import <React/RCTBridge.h>
#import <AVFoundation/AVFoundation.h>

@interface TtsControl : NSObject <RCTBridgeModule>
@end

@implementation TtsControl

RCT_EXPORT_MODULE();

@synthesize bridge = _bridge;

RCT_EXPORT_METHOD(stop) {
  id ttsModule = [_bridge moduleForName:@"TextToSpeech"];
  if (ttsModule) {
    AVSpeechSynthesizer *synthesizer = [ttsModule valueForKey:@"synthesizer"];
    if (synthesizer) {
      [synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    }
  }
}

@end
