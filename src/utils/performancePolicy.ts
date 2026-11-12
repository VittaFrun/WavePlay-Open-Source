export type FramePolicy={reduced:boolean;badWindows:number;goodWindows:number};
export const initialFramePolicy:FramePolicy={reduced:false,badWindows:0,goodWindows:0};

// Hysteresis avoids repeatedly swapping glass and opaque surfaces during a gesture.
export function nextFramePolicy(state:FramePolicy,frames:number,slowFrames:number):FramePolicy {
  if(frames<90)return state;
  const ratio=slowFrames/frames;
  if(!state.reduced){
    const badWindows=ratio>.22?state.badWindows+1:0;
    return {reduced:badWindows>=2,badWindows:badWindows>=2?0:badWindows,goodWindows:0};
  }
  const goodWindows=ratio<.08?state.goodWindows+1:0;
  return {reduced:goodWindows>=6?false:true,badWindows:0,goodWindows:goodWindows>=6?0:goodWindows};
}
