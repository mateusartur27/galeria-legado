const video = document.querySelector("#filme");
const stream = "/simplificado/video-alinhado/master.m3u8";
const error = document.querySelector("#erro");
function fail() { error.hidden = false; }
if (video.canPlayType("application/vnd.apple.mpegurl")) {
  video.src = stream;
} else if (window.Hls?.isSupported()) {
  const hls = new Hls({startLevel:-1, abrEwmaDefaultEstimate:5000000, capLevelToPlayerSize:true});
  hls.attachMedia(video);
  hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(stream));
  hls.on(Hls.Events.ERROR, (_, issue) => { if (issue.fatal) fail(); });
} else {
  fail();
}
video.addEventListener("error", fail);
video.addEventListener("playing", () => { error.hidden = true; });
