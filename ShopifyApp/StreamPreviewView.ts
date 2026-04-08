import { requireNativeComponent, ViewStyle } from 'react-native';

interface StreamPreviewViewProps {
  style?: ViewStyle;
}

const StreamPreviewView = requireNativeComponent<StreamPreviewViewProps>('StreamPreviewView');
export default StreamPreviewView;
