"""API local para WavePlay. Procesa únicamente contenido autorizado."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import yt_dlp

ROOT = Path(__file__).resolve().parent
DOWNLOADS = ROOT / "descargas-movil"
JOBS: dict[str, dict] = {}
LOCK = threading.Lock()


def ffmpeg_location() -> str | None:
    if shutil.which("ffmpeg"):
        return None
    candidates = list((Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages").glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"))
    return str(candidates[0].parent) if candidates else None


def safe_name(title: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", title).strip().rstrip(".")
    return (cleaned or "audio")[:130]


def send_json(handler: BaseHTTPRequestHandler, status: HTTPStatus, data: dict) -> None:
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_request(handler: BaseHTTPRequestHandler) -> dict:
    size = int(handler.headers.get("Content-Length", "0"))
    return json.loads(handler.rfile.read(size).decode("utf-8"))


def validate_url(data: dict) -> tuple[str, int]:
    url = str(data["url"]).strip()
    quality = int(data.get("quality", 320))
    if not url.startswith(("http://", "https://")):
        raise ValueError("La URL debe empezar por http:// o https://.")
    if quality not in (192, 256, 320):
        raise ValueError("La calidad no es válida.")
    return url, quality


def preview(url: str) -> dict:
    with yt_dlp.YoutubeDL({"quiet": True, "no_warnings": True, "noplaylist": True}) as downloader:
        info = downloader.extract_info(url, download=False)
    return {
        "title": info.get("title", "Audio sin título"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader") or info.get("channel"),
    }


def start_job(url: str, quality: int, info: dict) -> str:
    job_id = uuid.uuid4().hex
    with LOCK:
        JOBS[job_id] = {"id": job_id, "state": "queued", "progress": 0, "title": info["title"], "thumbnail": info.get("thumbnail")}
    threading.Thread(target=run_job, args=(job_id, url, quality, info), daemon=True).start()
    return job_id


def run_job(job_id: str, url: str, quality: int, info: dict) -> None:
    def hook(data: dict) -> None:
        with LOCK:
            job = JOBS[job_id]
            if data.get("status") == "downloading":
                total = data.get("total_bytes") or data.get("total_bytes_estimate")
                job.update(state="downloading", progress=round(data.get("downloaded_bytes", 0) * 100 / total) if total else 0)
            elif data.get("status") == "finished":
                job.update(state="converting", progress=100)

    DOWNLOADS.mkdir(exist_ok=True)
    stem = safe_name(info["title"])
    target = DOWNLOADS / f"{stem}.mp3"
    counter = 2
    while target.exists():
        target = DOWNLOADS / f"{stem} ({counter}).mp3"
        counter += 1
    options = {
        "format": "bestaudio/best",
        "outtmpl": str(target.with_suffix(".%(ext)s")),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "writethumbnail": True,
        "addmetadata": True,
        "progress_hooks": [hook],
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": str(quality)},
            {"key": "FFmpegMetadata", "add_metadata": True},
            {"key": "EmbedThumbnail", "already_have_thumbnail": False},
        ],
    }
    location = ffmpeg_location()
    if location:
        options["ffmpeg_location"] = location
    try:
        with yt_dlp.YoutubeDL(options) as downloader:
            downloader.extract_info(url, download=True)
        with LOCK:
            JOBS[job_id].update(state="ready", progress=100, fileName=target.name, downloadUrl=f"http://127.0.0.1:8000/files/{quote(target.name)}")
    except Exception as error:
        with LOCK:
            JOBS[job_id].update(state="error", message=str(error))


class Handler(BaseHTTPRequestHandler):
    server_version = "WavePlayLocal/2.0"
    def log_message(self, format: str, *args: object) -> None: print(f"[API] {self.address_string()} - {format % args}")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/health": return send_json(self, HTTPStatus.OK, {"ok": True})
        if path.startswith("/jobs/"):
            with LOCK: job = JOBS.get(path.removeprefix("/jobs/"))
            return send_json(self, HTTPStatus.OK if job else HTTPStatus.NOT_FOUND, job or {"message": "Descarga no encontrada."})
        if not path.startswith("/files/"): return send_json(self, HTTPStatus.NOT_FOUND, {"message": "Ruta no encontrada."})
        name = unquote(path.removeprefix("/files/"))
        file = DOWNLOADS / name
        if file.parent != DOWNLOADS or not file.is_file(): return send_json(self, HTTPStatus.NOT_FOUND, {"message": "Archivo no encontrado."})
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", mimetypes.guess_type(file.name)[0] or "audio/mpeg")
        self.send_header("Content-Length", str(file.stat().st_size))
        self.send_header("Content-Disposition", f'attachment; filename="{file.name}"')
        self.end_headers()
        with file.open("rb") as stream: shutil.copyfileobj(stream, self.wfile)

    def do_POST(self) -> None:
        try: data = read_request(self); url, quality = validate_url(data)
        except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error: return send_json(self, HTTPStatus.BAD_REQUEST, {"message": str(error)})
        try:
            info = preview(url)
            if self.path == "/preview": return send_json(self, HTTPStatus.OK, info)
            if self.path == "/downloads": return send_json(self, HTTPStatus.ACCEPTED, {"jobId": start_job(url, quality, info), **info})
            return send_json(self, HTTPStatus.NOT_FOUND, {"message": "Ruta no encontrada."})
        except Exception as error: return send_json(self, HTTPStatus.BAD_GATEWAY, {"message": f"No se pudo leer el enlace: {error}"})


if __name__ == "__main__":
    print("API local disponible en http://127.0.0.1:8000")
    ThreadingHTTPServer(("127.0.0.1", 8000), Handler).serve_forever()
