const scenarioDefinitions = Object.freeze({
  direct: Object.freeze({ videoId: 'direct_video', delayMs: 0, next: null }),
  delayed: Object.freeze({
    videoId: 'delayed_video',
    delayMs: 250,
    next: null,
  }),
  replaced: Object.freeze({
    videoId: 'replaced_video',
    delayMs: 0,
    next: null,
  }),
  autonext: Object.freeze({
    videoId: 'autonext_video',
    delayMs: 0,
    next: Object.freeze({ videoId: 'autonext_next', delayMs: 800 }),
  }),
});

/** @typedef {'direct'|'delayed'|'replaced'|'autonext'} YouTubeScenario */

/** @param {string | null} value @returns {value is YouTubeScenario} */
export function isYouTubeScenario(value) {
  return typeof value === 'string' && value in scenarioDefinitions;
}

/** @param {YouTubeScenario} scenario */
export function youtubeFixturePage(scenario) {
  const definition = scenarioDefinitions[scenario];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>YouTube fixture: ${scenario}</title>
    <style>
      body { background: #0f0f0f; color: #f1f1f1; font: 16px system-ui, sans-serif; margin: 0; }
      main { margin: 2rem auto; max-width: 960px; padding: 0 1rem; }
      #movie_player { background: #000; min-height: 360px; position: relative; }
      video { background: #000; display: block; height: 360px; width: 640px; max-width: 100%; }
      #fixture-controls { border: 1px solid #666; margin-top: 1rem; padding: 1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Owned YouTube test page</h1>
      <p id="fixture-status" aria-live="polite">Preparing ${scenario} scenario.</p>
      <section id="fixture-controls" aria-label="Test fixture controls">
        <p>Controls below exist only in the routed test fixture.</p>
        <button id="replace-player" type="button">Replace player</button>
        <button id="advance-video" type="button">Advance video</button>
      </section>
      <section id="player-host" aria-label="Video player"></section>
    </main>
    <script>
      (() => {
        const initialScenario = ${JSON.stringify(scenario)};
        const initialVideoId = ${JSON.stringify(definition.videoId)};
        const initialDelayMs = ${JSON.stringify(definition.delayMs)};
        const automaticNext = ${JSON.stringify(definition.next)};
        const host = document.querySelector('#player-host');
        const status = document.querySelector('#fixture-status');
        const events = [];
        let currentVideoId = initialVideoId;

        function record(event) {
          events.push(event);
          status.textContent = event;
        }

        function createLocalMedia(video) {
          if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
            record('local-media-unavailable');
            return;
          }
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const drawing = canvas.getContext('2d');
          if (!drawing) {
            record('local-media-unavailable');
            return;
          }
          const stream = canvas.captureStream(8);
          const chunks = [];
          const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
          recorder.addEventListener('dataavailable', event => {
            if (event.data.size > 0) chunks.push(event.data);
          });
          recorder.addEventListener('stop', () => {
            const media = new Blob(chunks, { type: 'video/webm' });
            video.src = URL.createObjectURL(media);
            video.play().catch(() => {});
            record('local-media-ready');
          }, { once: true });
          recorder.start();
          drawing.fillStyle = '#b91c1c';
          drawing.fillRect(0, 0, canvas.width, canvas.height);
          drawing.fillStyle = '#ffffff';
          drawing.font = '48px sans-serif';
          drawing.fillText('Local fixture media', 100, 190);
          window.setTimeout(() => recorder.stop(), 120);
        }

        function mountPlayer(videoId) {
          host.replaceChildren();
          const player = document.createElement('div');
          player.id = 'movie_player';
          player.dataset.videoId = videoId;
          const video = document.createElement('video');
          video.className = 'html5-main-video';
          video.dataset.videoId = videoId;
          video.controls = true;
          video.muted = true;
          video.playsInline = true;
          video.width = 640;
          video.height = 360;
          const fullscreen = document.createElement('button');
          fullscreen.className = 'ytp-fullscreen-button';
          fullscreen.type = 'button';
          fullscreen.textContent = 'Fullscreen';
          player.append(video, fullscreen);
          host.append(player);
          createLocalMedia(video);
          record('player-mounted:' + videoId);
        }

        function replacePlayer() {
          mountPlayer(currentVideoId);
          record('player-replaced:' + currentVideoId);
        }

        function advanceVideo(videoId = 'next_video') {
          currentVideoId = videoId;
          window.history.pushState({}, '', '/watch?v=' + encodeURIComponent(videoId));
          mountPlayer(videoId);
          document.dispatchEvent(new Event('yt-navigate-finish'));
          record('video-advanced:' + videoId);
        }

        document.querySelector('#replace-player').addEventListener('click', replacePlayer);
        document.querySelector('#advance-video').addEventListener('click', () => advanceVideo());
        window.__ytafFixture = Object.freeze({
          advanceVideo,
          history: () => [...events],
          player: () => document.querySelector('#movie_player'),
          replacePlayer,
          status: () => status.textContent,
        });

        if (initialScenario === 'delayed') {
          window.setTimeout(() => mountPlayer(currentVideoId), initialDelayMs);
        } else {
          mountPlayer(currentVideoId);
        }
        if (automaticNext !== null) {
          window.setTimeout(
            () => advanceVideo(automaticNext.videoId),
            automaticNext.delayMs,
          );
        }
      })();
    </script>
  </body>
</html>`;
}
