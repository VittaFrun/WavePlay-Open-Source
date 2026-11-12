import { AppAlert as Alert } from '../services/appAlert';
import { useEffect, useSyncExternalStore } from "react";
import { Pressable, Text, View } from 'react-native';
import { router } from "expo-router";
import { Screen } from "../components/Screen";
import { HeaderButton } from "../components/HeaderButton";
import { fonts, useTheme } from "../theme";
import {
  cancelAppUpdate,
  checkAppUpdate,
  downloadAppUpdate,
  getAppUpdate,
  installAppUpdate,
  subscribeAppUpdate,
} from "../services/appUpdates";
export default function Updates() {
  const { colors } = useTheme(),
    update = useSyncExternalStore(
      subscribeAppUpdate,
      getAppUpdate,
      getAppUpdate,
    );
  useEffect(() => {
    void checkAppUpdate();
  }, []);
  const pending =
      update.status === "downloading" || update.status === "verifying",
    ready = update.status === "ready";
  const install = () =>
    void installAppUpdate().catch((error) =>
      Alert.alert(
        "No se pudo instalar",
        error instanceof Error ? error.message : "Inténtalo de nuevo.",
      ),
    );
  return (
    <Screen>
      <View
        style={{
          height: 58,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <HeaderButton
          icon="chevron-left"
          label="Volver"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/(tabs)")
          }
        />
        <Text
          style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 25 }}
        >
          Actualizaciones
        </Text>
      </View>
      <View
        style={{
          backgroundColor: colors.surface2,
          borderRadius: 24,
          padding: 20,
          marginTop: 20,
          gap: 16,
        }}
      >
        <Text
          style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 20 }}
        >
          WavePlay {update.installed?.versionName || ""}
        </Text>
        {update.release ? (
          <>
            <Text
              style={{
                fontFamily: fonts.semiBold,
                color: colors.pink,
                fontSize: 17,
              }}
            >
              Nueva versión {update.release.versionName}
            </Text>
            <Text style={{ color: colors.muted }}>
              {Math.ceil(update.release.size / 1048576)} MB
            </Text>
            <Text style={{ color: colors.text, lineHeight: 22 }}>
              {update.release.notes}
            </Text>
          </>
        ) : null}
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted, lineHeight: 22 }}
        >
          {update.status === "checking"
            ? "Buscando actualizaciones…"
            : update.status === "current"
              ? "Tienes la versión más reciente."
              : update.status === "downloading"
                ? `Descargando… ${Math.round(update.progress * 100)} %`
                : update.status === "verifying"
                  ? "Verificando la descarga…"
                  : ready
                    ? "Actualización lista. Si Android solicita permiso, actívalo, vuelve aquí y pulsa Instalar."
                    : update.error ||
                      "Tus canciones y playlists se conservan al actualizar."}
        </Text>
        {pending ? (
          <View
            style={{
              height: 6,
              borderRadius: 3,
              backgroundColor: colors.surfaceHigh,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: 6,
                width: `${Math.round(update.progress * 100)}%`,
                backgroundColor: colors.pink,
              }}
            />
          </View>
        ) : null}
        <Pressable
          disabled={pending || update.status === "checking"}
          onPress={
            ready
              ? install
              : update.release
                ? () => void downloadAppUpdate()
                : () => void checkAppUpdate()
          }
          style={{
            minHeight: 50,
            borderRadius: 16,
            backgroundColor: colors.pink,
            alignItems: "center",
            justifyContent: "center",
            opacity: pending ? 0.5 : 1,
          }}
        >
          <Text style={{ fontFamily: fonts.bold, color: colors.background }}>
            {ready
              ? "Instalar actualización"
              : update.release
                ? "Descargar actualización"
                : "Buscar actualizaciones"}
          </Text>
        </Pressable>
        {pending ? (
          <Pressable
            disabled={update.status === "verifying"}
            onPress={() => void cancelAppUpdate().catch(() => {})}
            style={{
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.muted }}>Cancelar descarga</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}
