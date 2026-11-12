import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { Track } from "../types";
import { Artwork } from "./Artwork";
import { fonts, useTheme } from "../theme";
export const DjSessionSongRow = memo(function DjSessionSongRow({
  track,
  kept,
  busy,
  onPlay,
  onKeep,
  onOptions,
}: {
  track: Track;
  kept: boolean;
  busy: boolean;
  onPlay: (track: Track) => void;
  onKeep: (id: string) => void;
  onOptions: (track: Track) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{ height: 68, flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Pressable
        disabled={busy}
        onPress={() => onPlay(track)}
        accessibilityLabel={"Reproducir " + track.title}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          height: 68,
        }}
      >
        <Artwork uri={track.artwork} size={42} />
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{
              color: colors.text,
              fontFamily: fonts.semiBold,
              fontSize: 14,
            }}
          >
            {track.title}
          </Text>
          <Text
            numberOfLines={1}
            style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}
          >
            {track.artist}
          </Text>
        </View>
      </Pressable>
      <Pressable
        disabled={busy}
        accessibilityLabel={
          (kept ? "No conservar " : "Conservar ") + track.title
        }
        onPress={() => onKeep(track.id)}
        style={{
          width: 44,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons
          name={kept ? "pin" : "pin-outline"}
          size={20}
          color={kept ? colors.pink : colors.muted}
        />
      </Pressable>
      <Pressable
        disabled={busy}
        accessibilityLabel={"Opciones de " + track.title}
        onPress={() => onOptions(track)}
        style={{
          width: 44,
          height: 48,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <MaterialCommunityIcons
          name="dots-vertical"
          size={22}
          color={colors.muted}
        />
      </Pressable>
    </View>
  );
});
