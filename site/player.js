const video = document.querySelector("#filme");
const stage = document.querySelector("#passeio");
const entry = document.querySelector("#entrada");
const startButton = document.querySelector("#iniciar");
const pauseButton = document.querySelector("#pausar");
const status = document.querySelector("#status");
const stream = "/video-alinhado/master.m3u8";
const starts = [0,29,58,87,116,146,175,204,233,262];
let pendingChapter = null;
const chapterIds = ["milton","luizgama","reboucas","aleijadinho","gloria","machado","adhemar","nilo","pixinguinha","pele"];
const profile = document.querySelector("#perfil-tour");
const profileText = document.querySelector("#perfil-texto");
const profileName = document.querySelector("#perfil-nome");
const profileTitle = document.querySelector("#perfil-titulo");
const profileYears = document.querySelector("#perfil-anos");
let biographies = new Map();
let visibleChapter = -1;
let visibleParagraph = -1;

function opacityAt(time, start, end) {
  return Math.max(0, Math.min(1, (time-start)/.4, (end-time)/.35));
}

function updateProfiles(time = video.currentTime) {
  const chapter = starts.findLastIndex(start => start <= time);
  const info = biographies.get(chapterIds[chapter]);
  if (!info) return;
  if (chapter !== visibleChapter) {
    visibleChapter = chapter;
    visibleParagraph = -1;
    profileName.textContent = info.nome;
    profileTitle.textContent = info.titulo;
    profileYears.textContent = info.anos;
  }
  const local = time - starts[chapter];
  const duration = (starts[chapter+1] ?? 291) - starts[chapter];
  const split = chapter === 4 ? 17 : Math.round(duration / 2);
  const paragraph = local < split ? 0 : 1;
  if (paragraph !== visibleParagraph) {
    visibleParagraph = paragraph;
    profileText.textContent = info.textos[paragraph];
  }
  const headingAlpha = opacityAt(local, 1.1, duration-1.2);
  const paragraphAlpha = paragraph === 0
    ? opacityAt(local, 1.6, split-.15)
    : opacityAt(local, split+.15, duration-1.25);
  profile.hidden = headingAlpha === 0;
  profile.style.opacity = headingAlpha;
  profileText.hidden = paragraphAlpha === 0;
  profileText.style.opacity = paragraphAlpha;
}

fetch("/biografias-tour.json?v=5").then(response => {
  if (!response.ok) throw Error("Biografias indisponíveis");
  return response.json();
}).then(rows => {
  biographies = new Map(rows.map(row => [row.id,row]));
  updateProfiles();
}).catch(() => {});
if (typeof video.requestVideoFrameCallback === "function") {
  const paintProfile = (_, frame) => {
    updateProfiles(frame.mediaTime);
    video.requestVideoFrameCallback(paintProfile);
  };
  video.requestVideoFrameCallback(paintProfile);
} else {
  let tickId = 0;
  const animateProfile = () => {
    updateProfiles();
    if (!video.paused) tickId = requestAnimationFrame(animateProfile);
  };
  video.addEventListener("play", () => {
    cancelAnimationFrame(tickId);
    animateProfile();
  });
  video.addEventListener("pause", () => cancelAnimationFrame(tickId));
}
video.addEventListener("seeked", () => updateProfiles());
const connection = navigator.connection;
const limited = connection?.saveData || ["slow-2g","2g","3g"].includes(connection?.effectiveType);
const defaultEstimate = limited ? 2_000_000 : 8_000_000;

async function warmLoop() {
  if (limited) return;
  const master = new URL(stream, location.href);
  const playlistUrl = new URL("v0.m3u8", master);
  const preroll = await fetch(playlistUrl, {cache:"force-cache", priority:"low"});
  if (!preroll.ok) return;
  const segments = (await preroll.text()).split(/\r?\n/).filter(line => line && !line.startsWith("#"));
  if (!segments.length) return;
  const selected = new Set([segments[0], segments.at(-1)]);
  await Promise.all([...selected].map(async name => {
    const segment = await fetch(new URL(name, playlistUrl), {cache:"force-cache", priority:"low"});
    if (segment.ok) await segment.arrayBuffer();
  }));
}

function failed() {
  status.textContent = "O vídeo não carregou. Atualize a página para tentar de novo.";
  status.hidden = false;
}
function play() {
  video.play().catch(error => {
    if (error.name !== "AbortError") failed();
  });
}
function seek(index) {
  if (!video.readyState) {
    pendingChapter = index;
    return;
  }
  video.currentTime = starts[index] + .03;
}
function navigate(step) {
  const current = pendingChapter ?? starts.findLastIndex(start => start <= video.currentTime + .01);
  seek((Math.max(current, 0) + step + starts.length) % starts.length);
}
video.addEventListener("loadedmetadata", () => {
  if (pendingChapter !== null) {
    seek(pendingChapter);
    pendingChapter = null;
  }
});
if (video.canPlayType("application/vnd.apple.mpegurl")) {
  video.src = stream;
} else if (window.Hls?.isSupported()) {
  const hls = new Hls({startLevel:limited ? 0 : 1,abrEwmaDefaultEstimate:defaultEstimate,capLevelToPlayerSize:false,maxBufferLength:30,backBufferLength:30});
  hls.attachMedia(video);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(stream));
  hls.on(Hls.Events.ERROR, (_, error) => { if (error.fatal) failed(); });
} else {
  failed();
}
video.addEventListener("error", failed);
video.addEventListener("playing", () => { status.hidden = true; });
function syncPauseButton() {
  document.querySelector("#pausa-texto").textContent = video.paused ? "Continuar" : "Pausar";
  pauseButton.classList.toggle("retomar", video.paused);
  pauseButton.setAttribute("aria-label", video.paused ? "Continuar vídeo" : "Pausar vídeo");
}
video.addEventListener("play", syncPauseButton);
video.addEventListener("pause", syncPauseButton);
pauseButton.addEventListener("click", () => video.paused ? play() : video.pause());
document.querySelector("#anterior").addEventListener("click", () => navigate(-1));
document.querySelector("#proximo").addEventListener("click", () => navigate(1));
startButton.addEventListener("click", async () => {
  entry.hidden = true;
  stage.hidden = false;
  document.querySelector("#proximo").focus({preventScroll:true});
  video.muted = false;
  play();
  try {
    await document.documentElement.requestFullscreen?.();
    if (document.fullscreenElement && matchMedia("(pointer:coarse)").matches) {
      await screen.orientation?.lock?.("landscape");
    }
  } catch {
    // The mobile layout rotates the player if native orientation lock is unavailable.
  }
});
function exit() {
  video.pause();
  seek(0);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  stage.hidden = true;
  entry.hidden = false;
  startButton.focus();
}
document.querySelector("#sair").addEventListener("click", exit);
document.addEventListener("keydown", event => {
  if (stage.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "Escape") exit();
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    navigate(event.key === "ArrowLeft" ? -1 : 1);
  }
});

warmLoop().catch(() => {});
