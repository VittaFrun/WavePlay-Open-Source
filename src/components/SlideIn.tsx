import { View } from 'react-native';

export function SlideIn({children}:{index:number;children:React.ReactNode}) {
  return <View style={{flex:1}}>{children}</View>;
}
