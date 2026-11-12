import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { HeaderButton } from "../components/HeaderButton";
import { Screen } from "../components/Screen";
import { fonts, useTheme } from "../theme";

export default function LegalScreen() {const {colors}=useTheme();const s=useS();
  return (
    <Screen>
      <View style={s.top}>
        <HeaderButton icon="chevron-left" label="Volver" onPress={()=>router.back()}/>
        <Text style={s.title}>Uso responsable</Text>
      </View>
      <View style={s.hero}>
        <MaterialCommunityIcons
          name="shield-check-outline"
          size={38}
          color={colors.cyan}
        />
        <Text style={s.heroTitle}>Tu música, bajo tu control</Text>
        <Text style={s.heroText}>
          WavePlay está pensado para reproducir archivos locales y gestionar
          contenido que tengas derecho a utilizar.
        </Text>
      </View>
      <Text style={s.section}>BIBLIOTECA LOCAL</Text>
      <Text style={s.body}>
        La biblioteca, las playlists, los favoritos y el historial contienen
        únicamente archivos guardados en el dispositivo. El escáner excluye
        automáticamente notas de voz y audios identificados como archivos de
        WhatsApp, además de pistas de 90 segundos o menos y audios de 13
        minutos o más.
      </Text>
      <Text style={s.section}>VISUALIZADOR DE AUDIO</Text>
      <Text style={s.body}>
        Android solicita permiso de micrófono para entregar a WavePlay las
        muestras PCM de la canción en reproducción. Se usan únicamente para
        animar WaveBar en tiempo real. WavePlay no graba, conserva ni envía
        sonido ambiental.
      </Text>
      <Text style={s.section}>CONTENIDO ONLINE</Text>
      <Text style={s.body}>
        Los resultados proporcionados por servicios externos conservan su
        origen, título y miniatura. La reproducción debe respetar los controles,
        condiciones y restricciones del proveedor correspondiente.
      </Text>
      <Text style={s.section}>BÚSQUEDA DE LETRAS</Text>
      <Text style={s.body}>
        Al pulsar “Buscar letras”, WavePlay consulta LRCLIB con el título,
        artista, álbum y duración de esa canción para encontrar una letra.
        El archivo de audio no se envía. La búsqueda es opcional, se ejecuta
        únicamente cuando la solicitas y respeta los límites del servicio.
        Al abrir la búsqueda web de LRC, Google recibe el título y artista;
        Megalobiz es un filtro de esa búsqueda. Los sitios visitados aplican
        sus propias políticas de privacidad. Las letras copiadas se guardan
        localmente y el audio no se envía.
      </Text>
      <Text style={s.section}>DESCARGAS E IMPORTACIÓN</Text>
      <Text style={s.body}>
        Descarga o importa solamente contenido propio, autorizado expresamente
        por su titular, con licencia que permita la descarga o perteneciente al
        dominio público. WavePlay no concede derechos sobre contenido de
        terceros.
      </Text>
      <Text style={s.section}>YOUTUBE</Text>
      <Text style={s.body}>
        La búsqueda y reproducción mediante los servicios oficiales de YouTube
        estarán separadas de la biblioteca local. YouTube no permite utilizar su
        API para separar pistas de audio, ofrecer descargas externas ni
        reproducir su player en segundo plano.
      </Text>
    </Screen>
  );
}
const useS = () => { const {colors} = useTheme(); return StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  back: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: colors.text, fontFamily: fonts.bold, fontSize: 25 },
  hero: {
    backgroundColor: colors.surface2,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 19,
    marginTop: 12,
  },
  heroText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  section: {
    color: colors.cyan,
    fontFamily: fonts.extraBold,
    fontSize: 10,
    letterSpacing: 1.3,
    marginTop: 25,
    marginBottom: 7,
  },
  body: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 21,
  },
}); };
