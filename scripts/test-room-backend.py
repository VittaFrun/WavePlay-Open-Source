"""Integration check using the signed-in development devices; never logs credentials."""
import json
import pathlib
import sqlite3
import subprocess
import tempfile
import urllib.request
import urllib.error
import hashlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
config = {}
for name in (".env", ".env.local"):
    path = ROOT / name
    if path.exists():
        for line in path.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                key, value = line.split("=", 1)
                config[key.strip()] = value.strip().strip('"').strip("'")
BASE = config["EXPO_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = config["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
ADB = "C:/Android/Sdk/platform-tools/adb.exe"

def device_session(serial):
    raw = subprocess.check_output([ADB, "-s", serial, "exec-out", "run-as", "com.waveplay.app", "cat", "databases/RKStorage"])
    with tempfile.TemporaryDirectory(prefix="waveplay-test-") as folder:
        db = pathlib.Path(folder) / "storage.sqlite"
        db.write_bytes(raw)
        connection = sqlite3.connect(db)
        try:
            rows = connection.execute("select key,value from catalystLocalStorage").fetchall()
        finally:
            connection.close()
    for key, value in rows:
        if key.startswith("sb-") and key.endswith("-auth-token"):
            return json.loads(value)
    raise RuntimeError("El dispositivo no tiene una sesión iniciada.")

def request(session, path, body=None, method="POST", binary=False, extra=None):
    headers = {"apikey": KEY, "Authorization": "Bearer " + session["access_token"]}
    headers.update(extra or {})
    data = body if binary else json.dumps(body).encode() if body is not None else None
    if not binary:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=40) as response:
        content = response.read()
        return content if binary else json.loads(content) if content else None

def rpc(session, name, body):
    return request(session, "/rest/v1/rpc/" + name, body)

def ensure_denied(task):
    try:
        task()
    except urllib.error.HTTPError as error:
        if error.code in (400, 401, 403, 404):
            return
        raise
    raise AssertionError("Una operación no autorizada fue aceptada.")

if __name__ == "__main__":
    host = device_session("6x4hs4uktgamv8ba")
    guest = device_session("emulator-5554")
    assert host["user"]["id"] != guest["user"]["id"], "Se necesitan cuentas distintas."
    room = rpc(host, "create_listening_room", {"room_name": "Verificación temporal", "member_name": "Prueba anfitrión"})
    if isinstance(room, list):
        room = room[0]
    room_id = room["id"]
    try:
        rpc(guest, "join_listening_room", {"room_code": room["invite_code"], "member_name": "Prueba invitado"})
        # A small real MP3 fixture, supplied on the command line, is never added to either library.
        import sys
        audio = pathlib.Path(sys.argv[1]).read_bytes()
        duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", sys.argv[1]]))
        song = rpc(guest, "reserve_room_song", {"target_room": room_id, "song_title": "Audio de prueba", "song_artist": "Prueba", "song_duration": duration, "song_filename": "test.mp3", "song_size": len(audio), "member_name": "Prueba invitado"})
        if isinstance(song, list):
            song = song[0]
        ensure_denied(lambda: rpc(guest, "set_room_playback", {"target_room": room_id, "song_id": song["id"], "seconds": 0, "is_playing": True}))
        request(guest, "/storage/v1/object/room-audio/" + song["object_path"], audio, binary=True, extra={"Content-Type": "audio/mpeg"})
        request(guest, "/rest/v1/listening_room_queue?id=eq." + song["id"], {"status": "ready"}, method="PATCH")
        state = rpc(host, "get_room_snapshot", {"target_room": room_id})
        assert state["queue"][0]["status"] == "ready"
        rpc(host, "set_room_playback", {"target_room": room_id, "song_id": song["id"], "seconds": 1, "is_playing": True})
        state = rpc(guest, "get_room_snapshot", {"target_room": room_id})
        assert state["playback"]["track_id"] == song["id"] and state["playback"]["playing"]
        url = request(host, "/storage/v1/object/sign/room-audio/" + song["object_path"], {"expiresIn": 60})["signedURL"]
        with urllib.request.urlopen(BASE + "/storage/v1" + url, timeout=40) as response:
            received = response.read()
        assert hashlib.sha256(received).digest() == hashlib.sha256(audio).digest()
        rpc(host, "set_room_playback", {"target_room": room_id, "song_id": song["id"], "seconds": 3, "is_playing": False})
        paused = rpc(guest, "get_room_snapshot", {"target_room": room_id})
        assert not paused["playback"]["playing"] and paused["playback"]["position_seconds"] == 3
        assert paused["playback"]["revision"] > state["playback"]["revision"]
        rpc(host, "reorder_room_queue", {"target_room": room_id, "song_ids": [song["id"]]})
        print("PASS: invitado sube MP3, anfitrión descarga audio idéntico, ambos ven canción/pausa/posición, permisos de control y orden.")
        if "--keep" in sys.argv:
            pathlib.Path(ROOT / ".cache" / "room-device-test.json").write_text(json.dumps({"id": room_id, "code": room["invite_code"], "songId": song["id"]}))
            print("Sala lista para validar en dispositivos: " + room["invite_code"])
    finally:
        if "--keep" not in sys.argv:
            request(host, "/rest/v1/listening_rooms?id=eq." + room_id, {"status": "closed"}, method="PATCH")
            print("Sala de prueba cerrada; archivos pendientes de limpieza programada.")
