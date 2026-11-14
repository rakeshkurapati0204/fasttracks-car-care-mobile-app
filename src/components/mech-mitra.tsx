import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

// AI Assistant: the Ask AI assistant's small mechanic, in the Fasttracks maroon (same drawing as the dashboard's chat).
// Drawn once as SVG; the whole figure bobs gently (faster while `talking`).
export function MechMitra({ width = 40, talking = false }: { width?: number; talking?: boolean }) {
  const y = useSharedValue(0);
  useEffect(() => {
    const ms = talking ? 280 : 1200;
    y.value = withRepeat(withSequence(withTiming(-3, { duration: ms, easing: Easing.inOut(Easing.quad) }), withTiming(0, { duration: ms, easing: Easing.inOut(Easing.quad) })), -1);
  }, [talking, y]);
  const bob = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={bob} accessibilityLabel="AI Assistant" accessible>
      <Svg width={width} height={Math.round((width * 144) / 118)} viewBox="28 8 118 144">
        <G transform="translate(15 0)">
          <Rect x={42} y={128} width={16} height={18} rx={5} fill="#4F0F1C" /><Rect x={62} y={128} width={16} height={18} rx={5} fill="#4F0F1C" />
          <Rect x={40} y={142} width={20} height={8} rx={4} fill="#5F5E5A" /><Rect x={60} y={142} width={20} height={8} rx={4} fill="#5F5E5A" />
          <G transform="translate(36 96)">
            <Path d="M-9 40 Q0 27 9 40" fill="none" stroke="#8A8090" strokeWidth={3} />
            <Rect x={-18} y={38} width={36} height={20} rx={4} fill="#B83030" /><Rect x={-18} y={38} width={36} height={6} rx={3} fill="#7A1C2E" /><Rect x={-3} y={42} width={6} height={5} rx={1} fill="#F2C46B" />
            <Rect x={-6} y={0} width={12} height={28} rx={6} fill="#F4EEEF" stroke="#E8E0E1" /><Circle cx={0} cy={31} r={8} fill="#2A1A1D" />
          </G>
          <Rect x={32} y={82} width={56} height={50} rx={16} fill="#F4EEEF" stroke="#E8E0E1" /><Rect x={36} y={96} width={48} height={36} rx={10} fill="#7A1C2E" />
          <Rect x={42} y={84} width={8} height={16} fill="#7A1C2E" /><Rect x={70} y={84} width={8} height={16} fill="#7A1C2E" />
          <Circle cx={46} cy={98} r={2} fill="#F2C46B" /><Circle cx={74} cy={98} r={2} fill="#F2C46B" />
          <Rect x={52} y={108} width={16} height={12} rx={3} fill="#4F0F1C" /><SvgText x={60} y={117} textAnchor="middle" fontSize={8} fontWeight="500" fill="#fff">FT</SvgText>
          <Rect x={54} y={76} width={12} height={10} fill="#D99B6C" />
          <Circle cx={38} cy={60} r={5} fill="#EDB98A" /><Circle cx={82} cy={60} r={5} fill="#EDB98A" /><Rect x={39} y={38} width={42} height={42} rx={20} fill="#EDB98A" />
          <Path d="M36 46 Q36 20 60 20 Q84 20 84 46 Z" fill="#2A1A1D" /><Rect x={34} y={44} width={52} height={6} rx={3} fill="#444441" /><Circle cx={60} cy={32} r={5} fill="#E8A828" />
          <Ellipse cx={50} cy={61} rx={3} ry={4} fill="#2A1A1D" /><Ellipse cx={70} cy={61} rx={3} ry={4} fill="#2A1A1D" />
          <Path d="M45 55 Q50 52 55 55 M65 55 Q70 52 75 55" fill="none" stroke="#5F5E5A" strokeWidth={1.5} strokeLinecap="round" />
          <Circle cx={45} cy={69} r={4} fill="#F0997B" opacity={0.5} /><Circle cx={75} cy={69} r={4} fill="#F0997B" opacity={0.5} />
          {talking ? <Ellipse cx={60} cy={72} rx={5} ry={4} fill="#4F0F1C" /> : <Path d="M52 70 Q60 77 68 70" fill="none" stroke="#4F0F1C" strokeWidth={2.5} strokeLinecap="round" />}
          <G transform="translate(84 96) rotate(22)">
            <Rect x={-6} y={-30} width={12} height={34} rx={6} fill="#F4EEEF" stroke="#E8E0E1" /><Rect x={-2.5} y={-62} width={5} height={32} rx={2} fill="#8A8090" />
            <Circle cx={0} cy={-66} r={8.5} fill="#8A8090" /><Rect x={-4} y={-78} width={8} height={9} fill="#fff" /><Circle cx={0} cy={-32} r={8} fill="#2A1A1D" />
          </G>
        </G>
      </Svg>
    </Animated.View>
  );
}
