/**
 * Lazy-loads heavy third-party libraries on first use instead of on page
 * load. Right now this is just ffmpeg.wasm (audio + video tools), which is
 * a large download and unnecessary for anyone only using the doc/image/zip
 * tools.
 *
 * Usage: `await LibLoader.ffmpeg()` returns a ready-to-use ffmpeg.wasm
 * instance (already `.load()`ed).
 */
const LibLoader = (() => {
  let ffmpegScriptPromise = null;
  let ffmpegInstance = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) return resolve();
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
  }

  async function ffmpeg(onLog) {
    if (ffmpegInstance) return ffmpegInstance;

    if (!ffmpegScriptPromise) {
      ffmpegScriptPromise = loadScript(
        "https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js"
      );
    }
    await ffmpegScriptPromise;

    const { createFFmpeg } = window.FFmpeg;
    const instance = createFFmpeg({
      log: false,
      corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
      logger: onLog ? ({ message }) => onLog(message) : undefined,
    });
    await instance.load();
    ffmpegInstance = instance;
    return instance;
  }

  return { ffmpeg };
})();
